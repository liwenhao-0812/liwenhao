/* ========================================================================
   保单管理系统 - 01：全局状态与配置（已接入 Supabase Auth）
   ======================================================================== */

/* ======== 全局身份（Supabase Auth：邮箱+密码 → UUID）======== */
let currentUser = null;         // 旧变量：向后兼容（= currentUserEmail 前缀或 display）
let currentUserId = null;       // Supabase auth.users 的 UUID（auth.uid()，真正的身份主键）
let currentUserEmail = null;    // 登录邮箱
let currentSessionToken = null; // Supabase JWT access_token（通过 Authorization: Bearer 调用 REST）
let clientData = [];            // 当前用户的保单数据
let currentTab = 'home';        // 当前Tab页
let selectedClientIdx = -1;     // 当前选中客户索引（查询页）
let confirmCallback = null;     // 确认对话框回调

/* ======== Supabase 硬编码配置（项目级，所有用户共享一套）======== */
const SUPABASE_URL = 'https://mmvjtllkichjqnxebflw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1tdmp0bGxraWNoanFueGViZmx3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYwODQ2NzMsImV4cCI6MjEwMTY2MDY3M30.BTMK7Hy-KGAmGpegAecBbafdTS2JCwg857fmNBtvqpI';
const SUPABASE_REST_URL = SUPABASE_URL + '/rest/v1';
const SUPABASE_AUTH_URL = SUPABASE_URL + '/auth/v1';

/* ======== Supabase Client（仅用于 Realtime 订阅；Auth/REST 直接走 fetch）======== */
let supabaseClient = null;
let supabaseLastError = '';
let supabaseChannel = null;

/* 硬编码配置下，只要有会话就视为已配置 */
function hasSupabaseConfig() {
  return !!currentSessionToken;
}
function isSupabaseConnected() {
  return !!currentSessionToken;
}

/* 初始化 Supabase 客户端（用于 Realtime；REST 直接走 fetch 不依赖此 client） */
function initSupabase() {
  if (!supabaseClient && typeof supabase !== 'undefined') {
    try {
      supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        realtime: { params: { eventsPerSecond: 10 } }
      });
      console.log('[Supabase] 客户端已创建');
    } catch (e) {
      supabaseLastError = '初始化失败: ' + (e.message || e);
      console.error('[Supabase] init error:', e);
      return false;
    }
  }
  return !!supabaseClient;
}

/* ======== Supabase Auth REST API（直接走 fetch，避开 client 兼容性）======== */
async function sbAuthSignUp(email, password, displayName) {
  var body = { email: email, password: password };
  if (displayName) body.data = { display_name: displayName };
  var resp = await fetch(SUPABASE_AUTH_URL + '/signup', {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  var json = await resp.json();
  return { ok: resp.ok, status: resp.status, data: json };
}

async function sbAuthSignIn(email, password) {
  var resp = await fetch(SUPABASE_AUTH_URL + '/token?grant_type=password', {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email: email, password: password })
  });
  var json = await resp.json();
  return { ok: resp.ok, status: resp.status, data: json };
}

async function sbAuthSignOut() {
  if (!currentSessionToken) return { ok: true };
  var resp = await fetch(SUPABASE_AUTH_URL + '/logout', {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + currentSessionToken,
      'Content-Type': 'application/json'
    },
    body: '{}'
  });
  return { ok: resp.ok, status: resp.status };
}

async function sbAuthRefreshSession(refreshToken) {
  var resp = await fetch(SUPABASE_AUTH_URL + '/token?grant_type=refresh_token', {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ refresh_token: refreshToken })
  });
  var json = await resp.json();
  return { ok: resp.ok, status: resp.status, data: json };
}

/* 保存 Supabase 会话到 localStorage（加密） */
function saveSession(session) {
  if (!session) return;
  var token = session.access_token;
  var refresh = session.refresh_token;
  var expiresAt = session.expires_at || (Date.now() / 1000 + (session.expires_in || 3600));
  var user = session.user || {};
  var payload = {
    access_token: token,
    refresh_token: refresh,
    expires_at: expiresAt,
    user: {
      id: user.id,
      email: user.email,
      display_name: (user.user_metadata && user.user_metadata.display_name) || user.email
    }
  };
  currentSessionToken = token;
  currentUserId = user.id;
  currentUserEmail = user.email;
  currentUser = (user.user_metadata && user.user_metadata.display_name) || user.email.split('@')[0];
  secureSetItem('sb_session', payload, 'sb_session');
}

/* 从 localStorage 加载会话，必要时自动刷新 */
async function loadSessionOrNull() {
  var s = secureGetItem('sb_session', 'sb_session');
  if (!s) return null;
  var now = Date.now() / 1000;
  if (s.expires_at && s.expires_at - now < 60 && s.refresh_token) {
    var r = await sbAuthRefreshSession(s.refresh_token);
    if (r.ok) {
      saveSession(r.data);
      return s.user.id;
    } else {
      clearSession();
      return null;
    }
  }
  currentSessionToken = s.access_token;
  currentUserId = s.user.id;
  currentUserEmail = s.user.email;
  currentUser = s.user.display_name || s.user.email.split('@')[0];
  return currentUserId;
}

function clearSession() {
  currentSessionToken = null;
  currentUserId = null;
  currentUserEmail = null;
  currentUser = null;
  localStorage.removeItem('sb_session');
  localStorage.removeItem('sb_session_salt');
}

/* ======== Supabase 数据读写 REST API（按 user_id 隔离，RLS 会再次校验）======== */
async function supabaseLoadData() {
  if (!currentSessionToken || !currentUserId) return null;
  try {
    var resp = await fetch(SUPABASE_REST_URL + '/user_data?select=*&user_id=eq.' + encodeURIComponent(currentUserId), {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + currentSessionToken
      }
    });
    if (!resp.ok) {
      supabaseLastError = '读取失败: HTTP ' + resp.status;
      console.error('[Supabase] load error:', resp.status, await resp.text());
      return null;
    }
    var data = await resp.json();
    var result = data && data.length > 0 ? data[0] : null;
    console.log('[Supabase] 数据加载成功，user_id:', currentUserId.substring(0, 8) + '...', 'hasData:', !!result);
    return result;
  } catch (e) {
    supabaseLastError = '读取异常: ' + (e.message || e);
    console.error('[Supabase] load exception:', e);
    return null;
  }
}

async function supabaseSaveData() {
  if (!currentSessionToken || !currentUserId) return;
  try {
    var payload = {
      user_id: currentUserId,
      username: currentUser,
      data: clientData,
      insurance_types: getInsuranceTypeLib()
    };
    var checkResp = await fetch(SUPABASE_REST_URL + '/user_data?select=id&user_id=eq.' + encodeURIComponent(currentUserId), {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + currentSessionToken
      }
    });
    var existing = checkResp.ok ? await checkResp.json() : [];
    if (existing && existing.length > 0) {
      var patchResp = await fetch(SUPABASE_REST_URL + '/user_data?user_id=eq.' + encodeURIComponent(currentUserId), {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + currentSessionToken,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(payload)
      });
      if (!patchResp.ok) {
        supabaseLastError = '更新失败: HTTP ' + patchResp.status;
        console.error('[Supabase] patch error:', patchResp.status, await patchResp.text());
      } else {
        console.log('[Supabase] 数据更新成功');
      }
    } else {
      var postResp = await fetch(SUPABASE_REST_URL + '/user_data', {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + currentSessionToken,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(payload)
      });
      if (!postResp.ok) {
        supabaseLastError = '插入失败: HTTP ' + postResp.status;
        console.error('[Supabase] post error:', postResp.status, await postResp.text());
      } else {
        console.log('[Supabase] 数据插入成功');
      }
    }
  } catch (e) {
    supabaseLastError = '保存异常: ' + (e.message || e);
    console.error('[Supabase] save exception:', e);
  }
}

/* 测试 Supabase 连接 */
async function testSupabaseConnection() {
  if (!currentSessionToken) return { ok: false, error: '未登录或会话失效', details: '' };
  try {
    var readResp = await fetch(SUPABASE_REST_URL + '/user_data?select=id&user_id=eq.' + encodeURIComponent(currentUserId) + '&limit=1', {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + currentSessionToken
      }
    });
    if (!readResp.ok) {
      var err = await readResp.text();
      return { ok: false, error: '读取失败 (' + readResp.status + ')', details: err.substring(0, 200) };
    }
    return { ok: true, details: 'REST 读写权限: OK | RLS user_id=' + currentUserId.substring(0, 8) + '...' };
  } catch (e) {
    return { ok: false, error: '连接异常', details: (e.message || '') };
  }
}

/* 实时订阅（按 user_id 过滤） */
function supabaseSubscribeRealtime() {
  if (!currentSessionToken || !currentUserId) return;
  initSupabase();
  if (!supabaseClient) return;
  try {
    if (supabaseChannel) {
      try { supabaseClient.removeChannel(supabaseChannel); } catch(e) {}
    }
    supabaseChannel = supabaseClient
      .channel('user_data_changes_' + currentUserId.substring(0, 8))
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'user_data', filter: 'user_id=eq.' + currentUserId },
        function(payload) {
          if (!payload.new) return;
          if (payload.new.data) {
            clientData = payload.new.data;
            secureSetItem('policy_data_' + currentUserId, clientData);
          }
          if (payload.new.insurance_types) {
            secureSetItem('insurance_type_lib_' + currentUserId, payload.new.insurance_types);
          }
          refreshCurrentView();
          showToast('检测到其他设备的数据更新，已自动同步', 'success');
        }
      )
      .subscribe(function(status) {
        if (status === 'SUBSCRIBED') console.log('[Supabase] 实时订阅成功');
        else if (status === 'CHANNEL_ERROR') console.warn('[Supabase] Realtime 连接失败，请在后台启用 Database Replication → public → user_data');
      });
  } catch (e) {
    console.warn('[Supabase] 实时订阅初始化失败:', e.message, '— REST 同步仍可用');
  }
}

function refreshCurrentView() {
  switch(currentTab) {
    case 'home': renderDashboard(); break;
    case 'query': handleSearch(); break;
    case 'inslib': renderInsuranceTypeLib(); break;
  }
}

/* 向后兼容：旧代码以 currentUser 作为 localStorage 后缀，现在统一用 user_id。
   对旧存储 key（username 后缀）在首次登录时迁移一次即可，见 03-auth.js finishLogin。*/
