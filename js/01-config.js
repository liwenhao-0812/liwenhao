/* ========================================================================
   保单管理系统 - 完整JavaScript逻辑
   ======================================================================== */

/* ======== 全局状态 ======== */
let currentUser = null;         // 当前登录用户名
let clientData = [];            // 当前用户的保单数据
let currentTab = 'home';        // 当前Tab页
let selectedClientIdx = -1;     // 当前选中客户索引（查询页）
let confirmCallback = null;     // 确认对话框回调

/* ======== Supabase 配置 ======== */
let supabaseClient = null;
let supabaseLastError = '';    // 最近的错误信息
const SUPABASE_DEFAULTS = {
  url: 'https://YOUR_PROJECT_ID.supabase.co',
  anonKey: 'YOUR_ANON_KEY'
};

function initSupabase() {
  /* 先清理旧连接，避免 Multiple GoTrueClient 警告 */
  if (supabaseChannel) {
    try { supabaseClient.removeChannel(supabaseChannel); } catch(e) {}
    supabaseChannel = null;
  }
  supabaseClient = null;
  supabaseLastError = '';
  var url = secureGetItem('supabase_url_' + currentUser, 'supabase_config') || SUPABASE_DEFAULTS.url;
  var key = secureGetItem('supabase_key_' + currentUser, 'supabase_config') || SUPABASE_DEFAULTS.anonKey;
  if (url && key && url !== SUPABASE_DEFAULTS.url && key !== SUPABASE_DEFAULTS.anonKey) {
    try {
      supabaseClient = supabase.createClient(url, key, {
        realtime: { params: { eventsPerSecond: 10 } }
      });
      console.log('[Supabase] 客户端已创建，URL:', url.substring(0, 40) + '...');
      return true;
    } catch(e) {
      supabaseLastError = '初始化失败: ' + (e.message || e);
      console.error('[Supabase] init error:', e);
    }
  } else {
    if (!url || url === SUPABASE_DEFAULTS.url) supabaseLastError = '未配置有效的 Project URL';
    else if (!key || key === SUPABASE_DEFAULTS.anonKey) supabaseLastError = '未配置有效的 Anon Key';
    console.log('[Supabase] 未初始化 - URL或Key无效');
  }
  return false;
}

function hasSupabaseConfig() {
  var url = secureGetItem('supabase_url_' + currentUser, 'supabase_config');
  var key = secureGetItem('supabase_key_' + currentUser, 'supabase_config');
  return url && key && url.length > 10 && key.length > 10 && url !== SUPABASE_DEFAULTS.url && key !== SUPABASE_DEFAULTS.anonKey;
}

function isSupabaseConnected() {
  return supabaseClient !== null;
}

/* 获取 Supabase REST API 基础信息 */
function getSupabaseRestInfo() {
  var url = secureGetItem('supabase_url_' + currentUser, 'supabase_config') || '';
  var key = secureGetItem('supabase_key_' + currentUser, 'supabase_config') || '';
  return { url: url, key: key, restUrl: url ? url + '/rest/v1' : '' };
}

/* Supabase 连接测试（用原生 REST API 绕过客户端库） */
async function testSupabaseConnection() {
  if (!isSupabaseConnected() || !currentUser) {
    return { ok: false, error: supabaseLastError || '未连接到 Supabase', details: '' };
  }
  var info = getSupabaseRestInfo();
  var results = [];
  try {
    /* 1. 测试读取权限（GET） */
    var readResp = await fetch(info.restUrl + '/user_data?select=username&limit=1', {
      method: 'GET',
      headers: { 'apikey': info.key, 'Authorization': 'Bearer ' + info.key }
    });
    if (!readResp.ok) {
      var readErr = await readResp.text();
      return { ok: false, error: '读取失败 (' + readResp.status + ')', details: readErr.substring(0, 200) };
    }
    results.push('读取: OK');

    /* 2. 测试写入权限（POST 插入） */
    var testPayload = { username: currentUser + '_test', data: [], insurance_types: [] };
    var writeResp = await fetch(info.restUrl + '/user_data', {
      method: 'POST',
      headers: {
        'apikey': info.key,
        'Authorization': 'Bearer ' + info.key,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(testPayload)
    });
    if (!writeResp.ok) {
      var writeErr = await writeResp.text();
      return { ok: false, error: '写入失败 (' + writeResp.status + ')', details: writeErr.substring(0, 300) };
    }
    results.push('写入: OK');

    /* 3. 清理测试数据 */
    await fetch(info.restUrl + '/user_data?username=eq.' + encodeURIComponent(currentUser + '_test'), {
      method: 'DELETE',
      headers: { 'apikey': info.key, 'Authorization': 'Bearer ' + info.key }
    });

    /* 4. 提示 Realtime */
    results.push('Realtime: 需在 Dashboard 中手动启用');

    return { ok: true, error: null, details: results.join(' | ') };
  } catch(e) {
    return { ok: false, error: '连接异常', details: (e.message || '') };
  }
}

/* Supabase 读数据（原生 REST API） */
async function supabaseLoadData() {
  if (!isSupabaseConnected() || !currentUser) return null;
  var info = getSupabaseRestInfo();
  try {
    var resp = await fetch(info.restUrl + '/user_data?select=*&username=eq.' + encodeURIComponent(currentUser), {
      headers: { 'apikey': info.key, 'Authorization': 'Bearer ' + info.key }
    });
    if (!resp.ok) {
      supabaseLastError = '读取失败: HTTP ' + resp.status;
      console.error('[Supabase] load error:', resp.status, await resp.text());
      return null;
    }
    var data = await resp.json();
    var result = data && data.length > 0 ? data[0] : null;
    console.log('[Supabase] 数据加载成功，username:', currentUser, 'hasData:', !!result);
    return result;
  } catch(e) {
    supabaseLastError = '读取异常: ' + (e.message || e);
    console.error('[Supabase] load exception:', e);
    return null;
  }
}

/* Supabase 写数据（原生 REST API：先查后插/改） */
async function supabaseSaveData() {
  if (!isSupabaseConnected() || !currentUser) return;
  var info = getSupabaseRestInfo();
  try {
    var payload = {
      username: currentUser,
      data: clientData,
      insurance_types: getInsuranceTypeLib()
    };

    /* 先查是否存在 */
    var checkResp = await fetch(info.restUrl + '/user_data?select=id&username=eq.' + encodeURIComponent(currentUser), {
      headers: { 'apikey': info.key, 'Authorization': 'Bearer ' + info.key }
    });
    var existing = checkResp.ok ? await checkResp.json() : [];

    if (existing && existing.length > 0) {
      /* 已存在 → PATCH 更新 */
      var patchResp = await fetch(info.restUrl + '/user_data?username=eq.' + encodeURIComponent(currentUser), {
        method: 'PATCH',
        headers: {
          'apikey': info.key,
          'Authorization': 'Bearer ' + info.key,
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
      /* 不存在 → POST 插入 */
      var postResp = await fetch(info.restUrl + '/user_data', {
        method: 'POST',
        headers: {
          'apikey': info.key,
          'Authorization': 'Bearer ' + info.key,
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
  } catch(e) {
    supabaseLastError = '保存异常: ' + (e.message || e);
    console.error('[Supabase] save exception:', e);
  }
}

/* Supabase 实时订阅（非致命：失败不影响 REST API 同步） */
let supabaseChannel = null;
function supabaseSubscribeRealtime() {
  if (!isSupabaseConnected() || !currentUser) return;
  try {
    if (supabaseChannel) {
      try { supabaseClient.removeChannel(supabaseChannel); } catch(e) {}
    }
    supabaseChannel = supabaseClient
      .channel('user_data_changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'user_data', filter: 'username=eq.' + currentUser },
        function(payload) {
          if (payload.new && payload.new.username === currentUser) {
            /* 远端数据变更，自动同步到本地 */
            if (payload.new.data) {
              clientData = payload.new.data;
              secureSetItem('policy_data_' + currentUser, clientData);
            }
            if (payload.new.insurance_types) {
              secureSetItem('insurance_type_lib_' + currentUser, payload.new.insurance_types);
            }
            /* 刷新当前页面视图 */
            refreshCurrentView();
            showToast('检测到其他设备的数据更新，已自动同步', 'success');
          }
        }
      )
      .subscribe(function(status) {
        if (status === 'SUBSCRIBED') {
          console.log('[Supabase] 实时订阅成功');
        } else if (status === 'CHANNEL_ERROR') {
          console.warn('[Supabase] 实时订阅失败（WebSocket无法连接），数据同步仍可通过 REST API 工作');
          console.warn('[Supabase] 请在 Supabase Dashboard → Database → Replication 中启用 Realtime');
        }
      });
  } catch(e) {
    console.warn('[Supabase] 实时订阅初始化失败:', e.message, '— 数据同步仍可通过 REST API 工作');
  }
}

function refreshCurrentView() {
  switch(currentTab) {
    case 'home': renderDashboard(); break;
    case 'query': handleSearch(); break;
    case 'inslib': renderInsuranceTypeLib(); break;
  }
}

