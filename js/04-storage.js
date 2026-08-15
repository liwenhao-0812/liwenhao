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

        // 关键保护：禁止用本地空数据覆盖云端非空数据
        var cloudDlen = (cloudData.data && Array.isArray(cloudData.data)) ? cloudData.data.length : -1;
        var localDlen = Array.isArray(clientData) ? clientData.length : -1;

        if (!localTs || cloudTs > localTs) {
          console.log('[Supabase] 云端数据较新，拉取中... (cloud=' + cloudDlen + ', local=' + localDlen + ')');
          if (cloudData.data && Array.isArray(cloudData.data) && cloudDlen > 0) {
            clientData = cloudData.data;
            secureSetItem('policy_data_' + _idKey(), clientData, _ENC_HINT);
          } else if (cloudData.data && Array.isArray(cloudData.data) && cloudDlen === 0 && localDlen > 0) {
            // ★ 云端是空数组但本地有数据 → 不覆盖，保留本地数据
            console.warn('[Supabase] 云端 data 为空但本地有数据(' + localDlen + ')，保留本地并推送');
            updateLocalTimestamp();
            await supabaseSaveData();
            syncExistingPoliciesToLib();
            refreshCurrentTab();
            return;
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
        // 首次推送保护：如果本地也没数据，直接跳过（等用户导入或录数据）
        if (clientData.length === 0) {
          console.log('[Supabase] 本地也无数据，跳过首次推送（避免覆盖云端已有行）');
        } else {
          await supabaseSaveData();
        }
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

/* ★ 扫描 localStorage 中所有 policy_data_* 旧数据并尝试恢复
 * 旧系统使用 keyHint=username 加密，新系统用 _ENC_HINT
 * 如果用户之前在此浏览器使用过老系统，老数据可能仍然存在
 */
function scanAndRecoverOldData() {
  var recovered = { policies: [], insuranceTypes: [], sources: [] };
  var keysToTry = [];
  try {
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && (k.startsWith('policy_data_') || k.startsWith('insurance_type_lib_'))) {
        // 跳过当前用户的 key
        if (k === 'policy_data_' + _idKey() || k === 'insurance_type_lib_' + _idKey()) continue;
        // 跳过 timestamp key
        if (k.endsWith('_timestamp')) continue;
        keysToTry.push(k);
      }
    }
  } catch(e) {}

  // 尝试多种 keyHint 解密
  var hintsToTry = [
    currentUser,                  // 旧系统：keyHint = 用户名
    'baodan_storage_v1_salt',     // 新系统
    'liwenhao',                   // 硬编码用户名兜底
    ''                            // 空字符串兜底
  ];

  for (var ki = 0; ki < keysToTry.length; ki++) {
    var key = keysToTry[ki];
    for (var hi = 0; hi < hintsToTry.length; hi++) {
      var hint = hintsToTry[hi];
      try {
        var val = secureGetItem(key, hint);
        if (val !== null && val !== undefined && val !== false) {
          if (Array.isArray(val)) {
            var isInsType = key.startsWith('insurance_type_lib_');
            if (isInsType) {
              recovered.insuranceTypes = val;
              recovered.sources.push(key + ': insurTypes=' + val.length + ' (hint=' + (hint || 'empty') + ')');
            } else {
              recovered.policies = val;
              recovered.sources.push(key + ': policies=' + val.length + ' (hint=' + (hint || 'empty') + ')');
            }
            break;  // 成功解密就不再试其他 hint
          }
        }
      } catch(e) { /* 继续 */ }
    }
  }

  console.log('[恢复扫描] 发现旧key数=' + keysToTry.length + ', 成功恢复策略=' + recovered.policies.length + ', 险种=' + recovered.insuranceTypes.length);
  recovered._allKeysFound = keysToTry;
  return recovered;
}

/* ★ 将扫描到的旧数据合并到当前用户
 * options: { force: 是否强制导入(忽略去重/忽略空数据保护), silent: 不弹Toast }
 * 默认策略按 id 去重；force=true 时 clientData 为空 → 直接把 recovered.policies 整份覆盖导入
 */
function mergeOldDataToCurrent(recovered, options) {
  if (!recovered) return 0;
  var opts = typeof options === 'boolean' ? { silent: options } : (options || {});
  var merged = 0;
  if (recovered.policies && recovered.policies.length > 0) {
    var existing = Array.isArray(clientData) ? clientData : [];
    if (opts.force && existing.length === 0 && recovered.policies.length > 0) {
      // 强制导入且本地空 → 直接全量覆盖（原有的去重逻辑在 recovered 数据自己 id 都不同时会全导，但这里避免极端情况漏导）
      clientData = recovered.policies.slice();
      merged = recovered.policies.length;
    } else {
      var existingIds = {};
      existing.forEach(function(p) { if(p && p.id) existingIds[p.id] = true; });
      recovered.policies.forEach(function(p) {
        if (p && !existingIds[p.id || ('__gen_' + JSON.stringify(p))]) {
          existing.push(p);
          merged++;
          if (p && p.id) existingIds[p.id] = true;
        }
      });
      clientData = existing;
    }
    secureSetItem('policy_data_' + _idKey(), clientData, _ENC_HINT);
  }
  if (recovered.insuranceTypes && recovered.insuranceTypes.length > 0) {
    var lib = getInsuranceTypeLib();
    var existingCodes = {};
    lib.forEach(function(it) { if(it && it.codeType) existingCodes[it.codeType] = true; });
    var insAdded = 0;
    recovered.insuranceTypes.forEach(function(it) {
      if (it && it.codeType && !existingCodes[it.codeType]) {
        lib.push(it);
        existingCodes[it.codeType] = true;
        insAdded++;
      }
    });
    // 强制导入且保险库空的场景：直接全量
    if (opts.force && lib.length === 0 && recovered.insuranceTypes.length > 0 && insAdded === 0) {
      lib = recovered.insuranceTypes.slice();
      insAdded = lib.length;
    }
    secureSetItem('insurance_type_lib_' + _idKey(), lib, _ENC_HINT);
  }
  if (merged > 0 || (recovered.insuranceTypes && recovered.insuranceTypes.length > 0)) {
    syncExistingPoliciesToLib();
    refreshCurrentTab();
    if (!opts.silent) showToast('已恢复旧数据：' + merged + ' 条策略 + ' + (recovered.insuranceTypes ? recovered.insuranceTypes.length : 0) + ' 个险种', 'success');
  }
  return merged;
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
    var gotFromCloud = false;
    if (cloudData && cloudData.data && Array.isArray(cloudData.data) && cloudData.data.length > 0) {
      clientData = cloudData.data;
      secureSetItem('policy_data_' + _idKey(), clientData, _ENC_HINT);
      gotFromCloud = true;
    }
    if (cloudData && cloudData.insurance_types && Array.isArray(cloudData.insurance_types) && cloudData.insurance_types.length > 0) {
      secureSetItem('insurance_type_lib_' + _idKey(), cloudData.insurance_types, _ENC_HINT);
      gotFromCloud = true;
    }
    if (cloudData && cloudData.updated_at) {
      secureSetItem('policy_data_' + _idKey() + '_timestamp', cloudData.updated_at, _ENC_HINT);
    }

    // ★ 兜底：如果云端没拿到数据，尝试从旧 localStorage 恢复
    var recovered = scanAndRecoverOldData();
    var recoveryMerged = 0;
    if ((!gotFromCloud || clientData.length === 0) && recovered.sources.length > 0) {
      if (!silent) showToast('云端为空，正在从本地旧数据恢复...', 'info');
      recoveryMerged = mergeOldDataToCurrent(recovered, silent);
      // 恢复成功后立刻推送到云端
      if (recoveryMerged > 0) {
        console.log('[恢复] 恢复 ' + recoveryMerged + ' 条数据，推送到云端');
        await supabaseSaveData();
      }
    }

    if (gotFromCloud && !silent) {
      syncExistingPoliciesToLib();
      refreshCurrentTab();
      showToast('拉取成功！共 ' + clientData.length + ' 个客户', 'success');
    } else if (recoveryMerged > 0 && !silent) {
      showToast('✅ 已从本地旧数据恢复 ' + recoveryMerged + ' 条记录，并同步到云端', 'success');
    } else if (!silent) {
      // 最后兜底：显示 localStorage 有什么
      var lc = Array.isArray(clientData) ? clientData.length : 0;
      if (lc > 0) {
        syncExistingPoliciesToLib();
        refreshCurrentTab();
        showToast('拉取完成：本地已有 ' + lc + ' 条数据', 'info');
      } else {
        showToast('暂未找到任何数据，请先录入或导入', 'info');
      }
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

/* ★ 强制恢复本机旧数据（暴力扫描 localStorage 所有 key，不限于 policy_data_ 前缀）
 * 用于从老系统 localStorage 或早期版本加密密文里兜底救回数据
 */
async function sbForceRestoreLocalData() {
  if (!currentUser && !currentUserId) { showToast('请先登录', 'warning'); return; }
  showToast('正在扫描本机 localStorage 所有历史数据...', 'info');

  var candidates = [];  // [{ key, length, data: []|{}, isPolicies, isInsLib }]
  var allKeys = [];
  try {
    for (var i = 0; i < localStorage.length; i++) allKeys.push(localStorage.key(i));
  } catch(e) { allKeys = []; }

  // 生成所有可能的 keyHint 组合（多尝试）
  var allHints = [];
  for (var i = 0; i < allKeys.length; i++) {
    var k = allKeys[i];
    if (!k) continue;
    if (k.indexOf('_') !== -1) {
      // policy_data_xxx → xxx 可能是旧 keyHint
      var parts = k.split('_');
      allHints.push(parts[parts.length - 1]);
    }
  }
  allHints = allHints.concat([
    currentUser, 'baodan_storage_v1_salt', 'liwenhao',
    currentUserEmail, (currentUserEmail || '').split('@')[0],
    'admin', 'user', ''
  ]);
  // 去重
  var seen = {};
  var hints = [];
  for (var i = 0; i < allHints.length; i++) {
    if (allHints[i] === undefined) continue;
    var h = String(allHints[i]);
    if (!seen[h]) { seen[h] = true; hints.push(h); }
  }

  var bestPolicies = null;
  var bestInsurance = null;
  var bestPolicyLen = 0;
  var bestInsuranceLen = 0;

  for (var ki = 0; ki < allKeys.length; ki++) {
    var k = allKeys[ki];
    if (!k) continue;
    // 明显跳过：timestamp/session/token 相关
    if (/timestamp$|sb_session|gh_token|display_name|users_/.test(k)) continue;
    for (var hi = 0; hi < hints.length; hi++) {
      var hint = hints[hi];
      try {
        var val = secureGetItem(k, hint);
        if (Array.isArray(val) && val.length > 0) {
          // 判断是不是保单数据（有 policies，常见字段：id / clientName / policyCode）
          var isPolicies = false, isInsurance = false;
          for (var vi = 0; vi < Math.min(val.length, 5); vi++) {
            var item = val[vi];
            if (item && typeof item === 'object') {
              if ((item.id && (item.clientName || item.policyCode || item.policyName))) isPolicies = true;
              if ((item.codeType && item.insuranceName)) isInsurance = true;
            }
          }
          // 长度足够大的数组直接当候选（提醒机制）
          candidates.push({
            key: k, hint: hint, length: val.length,
            isPolicies: isPolicies, isInsurance: isInsurance
          });
          if (isPolicies && val.length > bestPolicyLen) {
            bestPolicies = val; bestPolicyLen = val.length;
          }
          if (isInsurance && val.length > bestInsuranceLen) {
            bestInsurance = val; bestInsuranceLen = val.length;
          }
        }
      } catch(e) {}
    }
  }

  console.log('[强制恢复] 扫描到候选数据:', candidates);

  var merged = 0;
  if (bestPolicies) {
    clientData = bestPolicies.slice();
    secureSetItem('policy_data_' + _idKey(), clientData, _ENC_HINT);
    merged = bestPolicies.length;
  }
  if (bestInsurance) {
    secureSetItem('insurance_type_lib_' + _idKey(), bestInsurance, _ENC_HINT);
  }

  if (merged > 0 || (bestInsurance && bestInsurance.length > 0)) {
    syncExistingPoliciesToLib();
    refreshCurrentTab();
    showToast('✅ 强制恢复：策略 ' + merged + ' 条 + 险种库 ' + (bestInsurance ? bestInsurance.length : 0) + ' 个，已自动推送到云端', 'success');
    updateLocalTimestamp();
    await supabaseSaveData();
  } else {
    // 实在找不到，给 Console 一个更详细的导出表
    console.warn('[强制恢复] 未识别到任何有效策略数据候选。所有候选 key：', candidates);
    if (candidates.length === 0) {
      showToast('⚠ 没找到任何历史数据：请确认这是「之前录入保单的同一台电脑/浏览器」', 'error');
    } else {
      showToast('⚠ 没找到可用数据：请把 Console 的 [强制恢复] 日志截图发给开发者', 'error');
    }
  }
  return { merged: merged, insuranceLen: bestInsuranceLen, candidates: candidates };
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

