/* ======== 数据存储（加密 + user_id 隔离）======== */

/* 统一的 localStorage key 主标识：优先 user_id，未登录时回退 currentUser */
function _idKey() {
  return currentUserId || currentUser || 'anon';
}
/* secureSetItem 的 keyHint 固定常量（不要再用用户名或 user_id，因为用户升级前后身份字符串不一样，会导致旧密文解不开）*/
const _ENC_HINT = 'baodan_storage_v1_salt';

/* 获取当前用户保单数据 */
function getPolicyData() {
  try {
    return secureGetItem('policy_data_' + _idKey(), _ENC_HINT) || [];
  } catch(e) { return []; }
}

/* 保存保单数据 */
function savePolicyData() {
  secureSetItem('policy_data_' + _idKey(), clientData, _ENC_HINT);
  updateLocalTimestamp();
  /* 同步到 Supabase */
  supabaseSaveData();
  /* 同时保留 GitHub 同步 */
  autoSyncPush();
}

/* 加载当前用户所有数据 */
async function loadUserData() {
  clientData = getPolicyData();

  console.log('[Supabase] loadUserData: hasSession=' + hasSupabaseConfig() + ', user_id=' + (currentUserId ? currentUserId.substring(0,8) + '...' : 'null'));

  if (hasSupabaseConfig()) {
    initSupabase();
    if (isSupabaseConnected()) {
      var cloudData = await supabaseLoadData();
      if (cloudData) {
        var localTs = secureGetItem('policy_data_' + _idKey() + '_timestamp', _ENC_HINT);
        var cloudTs = cloudData.updated_at || '';
        if (!localTs || cloudTs > localTs) {
          console.log('[Supabase] 云端数据较新，拉取中...');
          if (cloudData.data) {
            clientData = cloudData.data;
            secureSetItem('policy_data_' + _idKey(), clientData, _ENC_HINT);
          }
          if (cloudData.insurance_types) {
            secureSetItem('insurance_type_lib_' + _idKey(), cloudData.insurance_types, _ENC_HINT);
          }
          secureSetItem('policy_data_' + _idKey() + '_timestamp', cloudTs, _ENC_HINT);
          console.log('[Supabase] 已从云端加载最新数据，count=' + clientData.length);
          syncExistingPoliciesToLib();
          refreshCurrentTab();
        } else {
          console.log('[Supabase] 本地数据较新，推送到云端');
          await supabaseSaveData();
        }
      } else {
        console.log('[Supabase] 云端无数据，首次推送');
        await supabaseSaveData();
      }
      supabaseSubscribeRealtime();
    } else {
      console.log('[Supabase] 客户端初始化失败: ' + supabaseLastError);
    }
  }
}

/* 刷新当前时间戳 */
function updateLocalTimestamp() {
  secureSetItem('policy_data_' + _idKey() + '_timestamp', new Date().toISOString(), _ENC_HINT);
}

/* ======== 自动云同步（GitHub） ======== */

/* GitHub 配置 */
var GITHUB_OWNER = 'liwenhao-0812';
var GITHUB_REPO = 'liwenhao';
var GITHUB_BRANCH = 'master';

/* 获取用户配置的 GitHub Token（加密存储） */
function getGitHubToken() {
  try {
    return secureGetItem('gh_token_' + currentUser, 'gh_token_salt') || '';
  } catch(e) { return ''; }
}
function setGitHubToken(tok) {
  secureSetItem('gh_token_' + currentUser, tok, 'gh_token_salt');
}
function hasGitHubToken() {
  var t = getGitHubToken();
  return t && t.length > 10;
}

/* Token 配置 UI 函数 */
function saveGitHubTokenConfig() {
  var input = document.getElementById('githubTokenInput');
  var tok = input.value.trim();
  if (!tok) {
    showToast('请输入 GitHub Token', 'warning');
    return;
  }
  if (tok.length < 20 || (!tok.startsWith('ghp_') && !tok.startsWith('github_pat_'))) {
    showToast('Token格式不正确，请检查', 'error');
    return;
  }
  setGitHubToken(tok);
  input.value = '';
  document.getElementById('tokenStatus').innerHTML = '<span style="color:#16a34a;font-weight:600;">Token 已保存生效</span>';
  updateSettingSyncStatus(true);
  showToast('Token 已保存，云同步已启用', 'success');
  /* 触发一次同步 */
  setTimeout(function() { pushToCloud(); }, 500);
}
function toggleTokenVisibility() {
  var input = document.getElementById('githubTokenInput');
  var btn = document.getElementById('toggleTokenBtn');
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = '隐藏';
  } else {
    input.type = 'password';
    btn.textContent = '显示';
  }
}
function initTokenStatus() {
  var statusEl = document.getElementById('tokenStatus');
  if (!statusEl) return;
  if (hasGitHubToken()) {
    statusEl.innerHTML = '<span style="color:#16a34a;font-weight:600;">已配置 (当前长度: ' + getGitHubToken().length + ')</span>';
  } else {
    statusEl.innerHTML = '<span style="color:#dc2626;">未配置，云同步功能暂不可用</span>';
  }
}

/* ======== Supabase 配置函数 ======== */
function saveSupabaseConfig() {
  var url = document.getElementById('supabaseUrlInput').value.trim();
  var key = document.getElementById('supabaseKeyInput').value.trim();
  if (!url || !key) {
    showToast('请填写 Supabase URL 和 Anon Key', 'warning');
    return;
  }
  if (!url.startsWith('https://') || !url.includes('.supabase.co')) {
    showToast('URL 格式不正确，应以 https://xxx.supabase.co 开头', 'error');
    return;
  }
  if (key.length < 20) {
    showToast('Anon Key 格式不正确', 'error');
    return;
  }
  secureSetItem('supabase_url_' + currentUser, url, 'supabase_config');
  secureSetItem('supabase_key_' + currentUser, key, 'supabase_config');
  document.getElementById('supabaseUrlInput').value = '';
  document.getElementById('supabaseKeyInput').value = '';
  document.getElementById('supabaseStatus').innerHTML = '<span style="color:#d97706;">正在测试连接...</span>';

  /* 初始化客户端 */
  if (!initSupabase()) {
    document.getElementById('supabaseStatus').innerHTML = '<span style="color:#dc2626;">' + (supabaseLastError || '初始化失败') + '</span>';
    showToast('Supabase 初始化失败: ' + supabaseLastError, 'error');
    return;
  }

  /* 真正测试连接 */
  testSupabaseConnection().then(function(result) {
    if (result.ok) {
      var detailsHtml = result.details ? '<br><small style="color:#64748b;">' + result.details + '</small>' : '';
      document.getElementById('supabaseStatus').innerHTML = '<span style="color:#16a34a;font-weight:600;">连接成功！正在同步数据...</span>' + detailsHtml;
      showToast('Supabase 连接成功！', 'success');
      /* 推送当前数据 */
      supabaseSaveData().then(function() {
        supabaseSubscribeRealtime();
        document.getElementById('supabaseStatus').innerHTML = '<span style="color:#16a34a;font-weight:600;">实时同步已启用</span>' + detailsHtml;
        showToast('Supabase 实时同步已启用', 'success');
      });
    } else {
      var detailsHtml = result.details ? '<br><small style="color:#64748b;">' + result.details + '</small>' : '';
      document.getElementById('supabaseStatus').innerHTML = '<span style="color:#dc2626;font-weight:600;">' + result.error + '</span>' + detailsHtml;
      showToast('连接失败: ' + result.error, 'error');
    }
  });
}

function toggleSupabaseKeyVisibility() {
  var input = document.getElementById('supabaseKeyInput');
  var btn = document.getElementById('toggleSupabaseKeyBtn');
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = '隐藏';
  } else {
    input.type = 'password';
    btn.textContent = '显示';
  }
}

function initSupabaseStatus() {
  var statusEl = document.getElementById('supabaseStatus');
  if (!statusEl) return;
  if (hasSupabaseConfig()) {
    var connected = isSupabaseConnected();
    if (connected) {
      statusEl.innerHTML = '<span style="color:#16a34a;font-weight:600;">已配置并连接</span>';
    } else {
      statusEl.innerHTML = '<span style="color:#d97706;">已配置但未连接 (' + (supabaseLastError || '点击保存重新测试') + ')</span>';
    }
  } else {
    statusEl.innerHTML = '<span style="color:#94a3b8;">未配置，配置后即可实现跨设备实时同步</span>';
  }
}

/* 测试连接按钮（UI 封装） */
function testSupabaseConnectionUI() {
  if (!hasSupabaseConfig()) {
    showToast('请先填写 Supabase URL 和 Key', 'warning');
    return;
  }
  if (!initSupabase()) {
    document.getElementById('supabaseStatus').innerHTML = '<span style="color:#dc2626;">' + (supabaseLastError || '初始化失败') + '</span>';
    showToast('初始化失败: ' + supabaseLastError, 'error');
    return;
  }
  document.getElementById('supabaseStatus').innerHTML = '<span style="color:#d97706;">正在测试连接...</span>';
  testSupabaseConnection().then(function(result) {
    if (result.ok) {
      var detailsHtml = result.details ? '<br><small style="color:#64748b;">' + result.details + '</small>' : '';
      document.getElementById('supabaseStatus').innerHTML = '<span style="color:#16a34a;font-weight:600;">连接成功！</span>' + detailsHtml;
      showToast('Supabase 连接正常！', 'success');
      supabaseSaveData().then(function() {
        supabaseSubscribeRealtime();
      });
    } else {
      var detailsHtml = result.details ? '<br><small style="color:#64748b;">' + result.details + '</small>' : '';
      document.getElementById('supabaseStatus').innerHTML = '<span style="color:#dc2626;font-weight:600;">' + result.error + '</span>' + detailsHtml;
      showToast('连接失败: ' + result.error, 'error');
    }
  });
}

/* ★ Supabase 手动拉取（按"从云端拉取"按钮时调用）
 * silent=true 时不弹 Toast（仅自动触发场景），默认 false 给用户反馈
 */
async function sbManualPull(silent) {
  if (!currentUser && !currentUserId) { if (!silent) showToast('请先登录', 'warning'); return; }
  if (!hasSupabaseConfig()) { if (!silent) showToast('未配置 Supabase', 'warning'); return; }
  if (!initSupabase() || !isSupabaseConnected()) {
    if (!silent) showToast('Supabase 未连接: ' + (supabaseLastError || ''), 'error');
    return;
  }
  if (!silent) showToast('正在从 Supabase 拉取数据...', 'info');
  try {
    var cloudData = await supabaseLoadData();
    if (!cloudData) {
      if (!silent) showToast('云端暂无数据（先在这边推送一次）', 'warning');
      return;
    }
    var touched = false;
    if (cloudData.data && Array.isArray(cloudData.data)) {
      clientData = cloudData.data;
      secureSetItem('policy_data_' + _idKey(), clientData, _ENC_HINT);
      touched = true;
    }
    if (cloudData.insurance_types) {
      secureSetItem('insurance_type_lib_' + _idKey(), cloudData.insurance_types, _ENC_HINT);
      touched = true;
    }
    if (cloudData.updated_at) {
      secureSetItem('policy_data_' + _idKey() + '_timestamp', cloudData.updated_at, _ENC_HINT);
    }
    if (touched) {
      syncExistingPoliciesToLib();
      refreshCurrentTab();
      if (!silent) showToast('拉取成功！共 ' + clientData.length + ' 个客户', 'success');
    } else {
      if (!silent) showToast('云端数据已同步到本地，但数据为空或未识别', 'info');
    }
    supabaseSubscribeRealtime();
  } catch(e) {
    console.error('[sbManualPull] 失败:', e);
    if (!silent) showToast('拉取失败: ' + (e.message || e), 'error');
  }
}

/* Supabase 手动推送（按"推送到云端"按钮时调用 — savePolicyData 会自动 push 到 Supabase + GitHub）*/
function sbManualPush() {
  if (!currentUser && !currentUserId) { showToast('请先登录', 'warning'); return; }
  if (!hasSupabaseConfig() || !initSupabase()) { showToast('Supabase 未配置', 'warning'); return; }
  showToast('正在推送到 Supabase 云端...', 'info');
  supabaseSaveData().then(function(result) {
    if (result && result.ok) {
      showToast('推送成功！', 'success');
      updateLocalTimestamp();
      autoSyncPush(); /* 顺便同步 GitHub（若配置了Token） */
    } else {
      showToast('推送失败: ' + ((result && result.error) || '未知错误'), 'error');
    }
  }).catch(function(e) {
    showToast('推送失败: ' + (e.message || e), 'error');
  });
}

/* 获取当前用户的数据文件名 */
function getDataFileName() {
  return '保单数据_' + currentUser + '.json';
}

/* 获取所有用户数据（用于 GitHub 云端备份存储） */
function getAllUserData() {
  var users = getUsers();
  var me = users.find(function(u) { return u.username === currentUser; });
  return {
    policies: clientData,
    insuranceTypes: getInsuranceTypeLib(),
    _timestamp: Date.now().toString(),
    _user: currentUser,
    _userId: currentUserId || '',
    _userEmail: currentUserEmail || '',
    _passwordHash: me ? me.passwordHash : ''
  };
}

/* 从云端数据恢复到本地 */
function restoreFromCloudData(cloudData) {
  if (cloudData.policies) {
    clientData = cloudData.policies;
    secureSetItem('policy_data_' + _idKey(), clientData, _ENC_HINT);
  }
  if (cloudData.insuranceTypes) {
    secureSetItem('insurance_type_lib_' + _idKey(), cloudData.insuranceTypes, _ENC_HINT);
  }
  if (cloudData._timestamp) {
    secureSetItem('policy_data_' + _idKey() + '_timestamp', cloudData._timestamp, _ENC_HINT);
  }
}

/* 推送到 GitHub */
function pushToCloud() {
  if (!currentUser) return Promise.resolve();
  if (!hasGitHubToken()) {
    setSyncStatus('offline');
    updateSettingSyncStatus(false, '未配置Token');
    return Promise.resolve();
  }
  setSyncStatus('syncing');
  var fileName = getDataFileName();
  var data = getAllUserData();
  var content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));

  /* 先获取当前文件 SHA（如果存在） */
  return fetch('https://api.github.com/repos/' + GITHUB_OWNER + '/' + GITHUB_REPO + '/contents/' + encodeURIComponent(fileName) + '?ref=' + GITHUB_BRANCH, {
    headers: { 'Authorization': 'token ' + getGitHubToken() }
  })
  .then(function(r) {
    if (r.status === 404) return null; /* 文件不存在 */
    if (!r.ok) throw new Error('查询失败: ' + r.status);
    return r.json();
  })
  .then(function(fileInfo) {
    var body = {
      message: '自动同步保单数据 - ' + currentUser,
      content: content,
      branch: GITHUB_BRANCH
    };
    if (fileInfo && fileInfo.sha) {
      body.sha = fileInfo.sha;
    }
    return fetch('https://api.github.com/repos/' + GITHUB_OWNER + '/' + GITHUB_REPO + '/contents/' + encodeURIComponent(fileName), {
      method: 'PUT',
      headers: {
        'Authorization': 'token ' + getGitHubToken(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
  })
  .then(function(r) {
    if (!r.ok) throw new Error('推送失败: ' + r.status);
    secureSetItem('policy_data_' + currentUser + '_timestamp', Date.now().toString());
    setSyncStatus('synced');
    updateSettingSyncStatus(true);
  })
  .catch(function(e) {
    console.error('云同步推送失败:', e);
    setSyncStatus('offline');
    updateSettingSyncStatus(false);
  });
}

/* 静默自动拉取（首次登录时调用，无提示）—— Supabase 优先，GitHub 兜底 */
var autoPullFromCloud = function() {
  if (!currentUser && !currentUserId) return;
  if (hasSupabaseConfig() && isSupabaseConnected()) {
    sbManualPull(true);  // silent
    return;
  }
  if (!hasGitHubToken()) return;
  var fileName = getDataFileName();
  fetch('https://api.github.com/repos/' + GITHUB_OWNER + '/' + GITHUB_REPO + '/contents/' + encodeURIComponent(fileName) + '?ref=' + GITHUB_BRANCH, {
    headers: { 'Authorization': 'token ' + getGitHubToken() },
    cache: 'no-store'
  })
  .then(function(r) {
    if (r.status === 404) return null;
    if (!r.ok) return null;
    return r.json();
  })
  .then(function(fileInfo) {
     if (!fileInfo) return;
     var jsonStr = decodeURIComponent(escape(atob(fileInfo.content.replace(/\s/g, ''))));
     var cloudData = JSON.parse(jsonStr);
     var localTs = secureGetItem('policy_data_' + currentUser + '_timestamp') || '0';
     if (!cloudData._timestamp || cloudData._timestamp > localTs) {
       restoreFromCloudData(cloudData);
       syncExistingPoliciesToLib();
       setSyncStatus('synced');
       updateSettingSyncStatus(true);
       refreshCurrentTab();
     }
   })
  .catch(function() {});
};

/* 从 GitHub 拉取 */
function manualPull() {
  if (!currentUser) { showToast('请先登录', 'warning'); return; }
  if (!hasGitHubToken()) { showToast('请先在设置页配置GitHub Token', 'warning'); return; }
  setSyncStatus('syncing');
  showToast('正在从云端恢复数据...', 'info');
  var fileName = getDataFileName();

  fetch('https://api.github.com/repos/' + GITHUB_OWNER + '/' + GITHUB_REPO + '/contents/' + encodeURIComponent(fileName) + '?ref=' + GITHUB_BRANCH, {
    headers: { 'Authorization': 'token ' + getGitHubToken() }
  })
  .then(function(r) {
    if (r.status === 404) throw new Error('云端暂无备份数据');
    if (!r.ok) throw new Error('拉取失败: ' + r.status);
    return r.json();
  })
  .then(function(fileInfo) {
    var jsonStr = decodeURIComponent(escape(atob(fileInfo.content.replace(/\s/g, ''))));
    var cloudData = JSON.parse(jsonStr);
    var localTs = secureGetItem('policy_data_' + currentUser + '_timestamp') || '0';
    if (cloudData._timestamp && cloudData._timestamp > localTs) {
      restoreFromCloudData(cloudData);
      syncExistingPoliciesToLib();
      showToast('数据已从云端恢复', 'success');
      refreshCurrentTab();
    } else if (cloudData._timestamp && cloudData._timestamp <= localTs) {
      showToast('本地数据已是最新', 'info');
    } else {
      restoreFromCloudData(cloudData);
      syncExistingPoliciesToLib();
      showToast('数据已从云端恢复', 'success');
      refreshCurrentTab();
    }
    setSyncStatus('synced');
    updateSettingSyncStatus(true);
  })
  .catch(function(e) {
    showToast('恢复失败: ' + e.message, 'error');
    setSyncStatus('offline');
    updateSettingSyncStatus(false);
  });
}

/* 手动推送 */
function manualPush() {
  if (!currentUser) { showToast('请先登录', 'warning'); return; }
  showToast('正在同步到云端...', 'info');
  pushToCloud().then(function() {
    showToast('同步成功', 'success');
  });
}

/* 自动推送（数据变更时调用，使用防抖避免频繁请求） */
var _autoSyncTimer = null;
function autoSyncPush() {
  if (!currentUser) return;
  if (!hasGitHubToken()) return;
  secureSetItem('policy_data_' + currentUser + '_timestamp', Date.now().toString());
  if (_autoSyncTimer) clearTimeout(_autoSyncTimer);
  _autoSyncTimer = setTimeout(function() {
    pushToCloud();
  }, 3000); /* 3秒防抖，连续操作只触发一次 */
}

/* 定时自动拉取云端数据（多设备同步） */
var _autoPullTimer = null;
function startAutoPull() {
  if (_autoPullTimer) clearInterval(_autoPullTimer);
  _autoPullTimer = setInterval(function() {
    if (!currentUser) return;
    if (!hasGitHubToken()) return;
    var fileName = getDataFileName();
    fetch('https://api.github.com/repos/' + GITHUB_OWNER + '/' + GITHUB_REPO + '/contents/' + encodeURIComponent(fileName) + '?ref=' + GITHUB_BRANCH, {
      headers: { 'Authorization': 'token ' + getGitHubToken() },
      cache: 'no-store'
    })
    .then(function(r) {
      if (r.status === 404) return null;
      if (!r.ok) return null;
      return r.json();
    })
    .then(function(fileInfo) {
      if (!fileInfo) return;
      var jsonStr = decodeURIComponent(escape(atob(fileInfo.content.replace(/\s/g, ''))));
      var cloudData = JSON.parse(jsonStr);
      var localTs = secureGetItem('policy_data_' + currentUser + '_timestamp') || '0';
      if (cloudData._timestamp && cloudData._timestamp > localTs) {
        restoreFromCloudData(cloudData);
        syncExistingPoliciesToLib();
        console.log('自动同步：云端数据已更新到本地');
        refreshCurrentTab();
      }
    })
    .catch(function() {});
  }, 5 * 60 * 1000); /* 每5分钟检查一次 */
}

/* 更新设置页的同步状态（GitHub 备用通道状态 + Supabase 会话状态栏）*/
function updateSettingSyncStatus(ok, customMsg) {
  var dot = document.getElementById('settingSyncDot');
  var status = document.getElementById('settingSyncStatus');
  var time = document.getElementById('settingSyncTime');
  if (dot) {
    if (!hasGitHubToken()) {
      dot.style.background = hasSupabaseConfig() ? '#22c55e' : '#f59e0b';
    } else {
      dot.style.background = ok ? '#22c55e' : '#ef4444';
    }
  }
  if (status) {
    if (customMsg) {
      status.textContent = customMsg;
    } else if (hasSupabaseConfig()) {
      status.textContent = ok ? '云端实时同步已启用（Supabase Auth）' : 'Supabase 同步失败，但本地数据安全';
    } else if (!hasGitHubToken()) {
      status.textContent = '登录后自动启用 Supabase 云同步';
    } else {
      status.textContent = ok ? 'GitHub 自动同步已启用' : '同步失败，请检查网络';
    }
  }
  if (time) {
    var lastTs = secureGetItem('policy_data_' + _idKey() + '_timestamp', _ENC_HINT);
    time.textContent = lastTs ? '上次同步: ' + new Date(parseInt(lastTs)).toLocaleString('zh-CN') : '数据变更时自动保存';
  }
  /* Supabase 会话状态栏（设置 Tab 卡片内）*/
  var sbStatusEl = document.getElementById('sbAuthStatus');
  var sbUserEl = document.getElementById('sbAuthUser');
  if (sbStatusEl) {
    if (currentSessionToken && currentUserId) {
      sbStatusEl.textContent = '✓ 已连接，RLS 按 UUID 隔离';
      sbStatusEl.style.color = '#15803d';
      if (sbUserEl) {
        sbUserEl.textContent = '账号: ' + (currentUserEmail || '') + ' | 显示名: ' + (currentUser || '');
      }
    } else {
      sbStatusEl.textContent = '未登录 — 登录后自动启用云同步';
      sbStatusEl.style.color = '#b45309';
      if (sbUserEl) sbUserEl.textContent = '';
    }
  }
}

/* 设置同步状态 */
function setSyncStatus(status) {
  const dot = document.getElementById('syncDot');
  const text = document.getElementById('syncStatusText');
  if (!dot || !text) return;
  dot.className = 'sync-dot';
  if (!hasGitHubToken()) {
    dot.classList.add('offline');
    text.textContent = '未配置Token';
  } else if (status === 'synced') {
    text.textContent = '已同步';
  } else if (status === 'syncing') {
    dot.classList.add('syncing');
    text.textContent = '同步中...';
  } else {
    dot.classList.add('offline');
    text.textContent = '未连接';
  }
}

