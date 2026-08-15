/* ======== 数据存储（加密 + 用户隔离） ======== */

/* 获取当前用户保单数据 */
function getPolicyData() {
  try {
    return secureGetItem('policy_data_' + currentUser) || [];
  } catch(e) { return []; }
}

/* 保存保单数据 */
function savePolicyData() {
  secureSetItem('policy_data_' + currentUser, clientData);
  updateLocalTimestamp();
  /* 同步到 Supabase */
  supabaseSaveData();
  /* 同时保留 GitHub 同步 */
  autoSyncPush();
}

/* 加载当前用户所有数据 */
async function loadUserData() {
  clientData = getPolicyData();

  console.log('[Supabase] loadUserData: hasConfig=' + hasSupabaseConfig() + ', connected=' + isSupabaseConnected());

  /* 尝试从 Supabase 加载最新数据 */
  if (hasSupabaseConfig()) {
    /* 确保客户端已初始化 */
    if (!isSupabaseConnected()) {
      initSupabase();
    }
    if (isSupabaseConnected()) {
      var cloudData = await supabaseLoadData();
      if (cloudData) {
        /* 比较时间戳，用较新的数据 */
        var localTs = secureGetItem('policy_data_' + currentUser + '_timestamp');
        var cloudTs = cloudData.updated_at || '';
        if (!localTs || cloudTs > localTs) {
          console.log('[Supabase] 云端数据较新，拉取中...');
          if (cloudData.data) {
            clientData = cloudData.data;
            secureSetItem('policy_data_' + currentUser, clientData);
          }
          if (cloudData.insurance_types) {
            secureSetItem('insurance_type_lib_' + currentUser, cloudData.insurance_types);
          }
          secureSetItem('policy_data_' + currentUser + '_timestamp', cloudTs);
          console.log('[Supabase] 已从云端加载最新数据');
        } else {
          /* 本地数据较新，推送到 Supabase */
          console.log('[Supabase] 本地数据较新，推送到云端');
          await supabaseSaveData();
        }
      } else {
        /* Supabase 无数据，首次推送 */
        console.log('[Supabase] 云端无数据，首次推送');
        await supabaseSaveData();
      }
      /* 订阅实时变更 */
      supabaseSubscribeRealtime();
    } else {
      console.log('[Supabase] 客户端初始化失败: ' + supabaseLastError);
    }
  }
}

/* 刷新当前时间戳 */
function updateLocalTimestamp() {
  secureSetItem('policy_data_' + currentUser + '_timestamp', new Date().toISOString());
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

/* 获取当前用户的数据文件名 */
function getDataFileName() {
  return '保单数据_' + currentUser + '.json';
}

/* 获取所有用户数据（用于云端存储） */
function getAllUserData() {
  var users = getUsers();
  var me = users.find(function(u) { return u.username === currentUser; });
  return {
    policies: clientData,
    insuranceTypes: getInsuranceTypeLib(),
    _timestamp: Date.now().toString(),
    _user: currentUser,
    _passwordHash: me ? me.passwordHash : ''
  };
}

/* 从云端数据恢复到本地 */
function restoreFromCloudData(cloudData) {
  if (cloudData.policies) {
    clientData = cloudData.policies;
    secureSetItem('policy_data_' + currentUser, clientData);
  }
  if (cloudData.insuranceTypes) {
    secureSetItem('insurance_type_lib_' + currentUser, cloudData.insuranceTypes);
  }
  if (cloudData._timestamp) {
    secureSetItem('policy_data_' + currentUser + '_timestamp', cloudData._timestamp);
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

/* 静默自动拉取（首次登录时调用，无提示） */
var autoPullFromCloud = function() {
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

/* 更新设置页的同步状态 */
function updateSettingSyncStatus(ok, customMsg) {
  var dot = document.getElementById('settingSyncDot');
  var status = document.getElementById('settingSyncStatus');
  var time = document.getElementById('settingSyncTime');
  if (dot) {
    if (!hasGitHubToken()) {
      dot.style.background = '#f59e0b'; /* 橙色：未配置Token */
    } else {
      dot.style.background = ok ? '#22c55e' : '#ef4444';
    }
  }
  if (status) {
    if (customMsg) {
      status.textContent = customMsg;
    } else if (!hasGitHubToken()) {
      status.textContent = '请配置GitHub Token';
    } else {
      status.textContent = ok ? '自动同步已启用' : '同步失败，请检查网络';
    }
  }
  if (time) {
    if (!hasGitHubToken()) {
      time.textContent = '请前往下方「GitHub Token 配置」创建设置Token以启用云同步';
    } else {
      var lastTs = secureGetItem('policy_data_' + currentUser + '_timestamp');
      time.textContent = lastTs ? '上次同步: ' + new Date(parseInt(lastTs)).toLocaleString('zh-CN') : '数据变更时自动保存到云端';
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

