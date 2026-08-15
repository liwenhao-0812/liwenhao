/* ======== PDF/打印 功能 ======== */
/**
 * 构建打印时的页眉页脚 + 控制单个保单打印范围
 */
function _ensurePrintContainer() {
  var el = document.getElementById('printHeaderArea');
  if (el) return el;
  var ph = document.createElement('div');
  ph.id = 'printHeaderArea';
  ph.className = 'print-header no-print';
  ph.style.cssText = 'display:none;';
  ph.innerHTML =
    '<div class="ph-title">保单管理系统 · 档案打印件</div>' +
    '<div class="ph-sub">仅供内部存档使用 · 含敏感信息请勿外传</div>';
  document.body.insertBefore(ph, document.body.firstChild);

  var pf = document.createElement('div');
  pf.id = 'printFooterArea';
  pf.className = 'print-footer no-print';
  pf.style.cssText = 'display:none;';
  pf.innerText = '系统生成时间：' + new Date().toLocaleString('zh-CN');
  document.body.appendChild(pf);
  return ph;
}

/**
 * 打印当前客户名下某一份指定保单详情
 */
function printSinglePolicy(clientIdx, policyIdx) {
  _ensurePrintContainer();
  var c = clientData[clientIdx];
  if (!c) { showToast('客户数据不存在', 'error'); return; }
  var p = (c.policies || [])[policyIdx];
  if (!p) { showToast('保单数据不存在', 'error'); return; }

  /* 临时隐藏：所有detail-section之外的其他保单卡、其他面板 */
  var allCards = document.querySelectorAll('.policy-detail-card');
  var targetId = 'policyDetail_' + policyIdx;
  allCards.forEach(function(card) {
    if (card.id !== targetId) {
      card.dataset._hiddenForPrint = '1';
      card.style.display = 'none';
    }
  });

  /* 显示页眉页脚 */
  var ph = document.getElementById('printHeaderArea');
  var pf = document.getElementById('printFooterArea');
  ph.style.display = 'block';
  pf.style.display = 'block';

  showToast('正在准备打印，请稍候...', 'info');
  setTimeout(function() {
    window.print();
    /* 打印完成后恢复 */
    setTimeout(function() {
      allCards.forEach(function(card) {
        if (card.dataset._hiddenForPrint === '1') {
          delete card.dataset._hiddenForPrint;
          card.style.display = '';
        }
      });
      ph.style.display = 'none';
      pf.style.display = 'none';
    }, 300);
  }, 200);
}

/**
 * 打印当前客户名下所有保单 + 客户信息 + 联系记录（完整档案）
 */
function printClientAllPolicies(clientIdx) {
  _ensurePrintContainer();
  var c = clientData[clientIdx];
  if (!c) { showToast('客户数据不存在', 'error'); return; }

  /* 隐藏左侧查询列表panel（保持右侧详情） */
  var leftPanel = document.querySelector('.two-col-layout > .client-list-panel') || document.querySelector('.list-area, .client-list');
  if (leftPanel) {
    leftPanel.dataset._hiddenForPrint = '1';
    leftPanel.style.display = 'none';
  }

  /* 显示页眉页脚 */
  var ph = document.getElementById('printHeaderArea');
  var pf = document.getElementById('printFooterArea');
  ph.style.display = 'block';
  pf.style.display = 'block';

  showToast('正在准备PDF打印，请在打印对话框中选择「另存为PDF」', 'info');
  setTimeout(function() {
    window.print();
    /* 打印完成后恢复 */
    setTimeout(function() {
      if (leftPanel && leftPanel.dataset._hiddenForPrint === '1') {
        delete leftPanel.dataset._hiddenForPrint;
        leftPanel.style.display = '';
      }
      ph.style.display = 'none';
      pf.style.display = 'none';
    }, 300);
  }, 250);
}

/* 清空数据 */
function confirmClearData() {
  showConfirm('确定要清空当前用户的所有数据吗？此操作不可撤销！', function() {
    clientData = [];
    savePolicyData();
    refreshCurrentTab();
    showToast('数据已清空', 'success');
  });
}

/* 修改密码 */
function changePassword() {
  var oldPwd = document.getElementById('oldPwd').value;
  var newPwd = document.getElementById('newPwd').value;
  if (!oldPwd || !newPwd) {
    showToast('请填写当前密码和新密码', 'warning');
    return;
  }
  if (newPwd.length < 6) {
    showToast('新密码长度至少6位', 'warning');
    return;
  }
  var users = getUsers();
  var user = users.find(function(u) { return u.username === currentUser; });
  if (!user) { showToast('用户不存在', 'error'); return; }
  if (user.passwordHash !== simpleHash(oldPwd)) {
    showToast('当前密码错误', 'error');
    return;
  }
  user.passwordHash = simpleHash(newPwd);
  saveUsers(users);
  document.getElementById('oldPwd').value = '';
  document.getElementById('newPwd').value = '';
  showToast('密码修改成功', 'success');
}

/* ======== 话术工具 ======== */

var SS_STORAGE_KEY = 'sales_script_data';
var ssData = null;
var ssCurrentNodeId = null;
var ssEditMode = false;
var ssNodeMap = {};
var ssPanelOpen = false;

/* 默认话术数据 */
function ssGetDefaultData() {
  return {
    id: 'root', title: '开场白', script: '您好，我是您的专属保险顾问，今天主要是想跟您沟通一下您的保障需求，帮您做一次全面的家庭保障梳理。', notes: '保持自然、亲切的语气，先建立信任再切入主题', category: '开场', children: [
      { id: 'c1', title: '客户感兴趣', script: '太好了！那我先了解一下您目前的情况，这样我可以为您推荐最适合的方案。', notes: '客户表现出兴趣时，趁热打铁，快速进入需求挖掘', category: '需求挖掘', children: [
        { id: 'c1_1', title: '已有保险', script: '那您目前的保障配置是怎样的呢？我可以帮您看看有没有重复或缺失的部分。', notes: '了解客户已有的保单，避免重复推荐', category: '需求挖掘', children: [
          { id: 'c1_1_1', title: '重疾险', script: '您现有的重疾险保额是多少呢？根据现在的医疗费用水平，建议保额至少在30-50万。如果不够的话，我们有一款性价比很高的产品可以补充。', notes: '强调保额不足的风险，用数据说话', category: '产品介绍', children: [
            { id: 'c1_1_1a', title: '客户认同保额不足', script: '是的，医疗费用每年都在上涨。我们这款重疾险不仅保费合理，还包含了轻症和中症的赔付，保障范围非常全面。', notes: '介绍产品亮点：轻症/中症赔付', category: '产品推荐', children: [] },
            { id: 'c1_1_1b', title: '客户觉得够了', script: '那很好，说明您已经有很好的保障意识了。不过我想提醒您关注一下医疗险，重疾险是给付型的，而医疗险可以报销住院费用，两者互补效果更好。', notes: '不要强行推销，转而推荐医疗险作为补充', category: '异议处理', children: [] }
          ]},
          { id: 'c1_1_2', title: '医疗险/意外险', script: '医疗险和意外险是基础保障，非常实用。不过这两类险种通常保额有限，遇到重大疾病时可能不够用。我建议再搭配一份重疾险，形成完整保障。', notes: '从基础保障引导到重疾险', category: '产品推荐', children: [] }
        ]},
        { id: 'c1_2', title: '没有保险', script: '那说明您今天联系我真是非常及时！越早配置保障，保费越低，而且健康状况好的时候投保也更顺利。', notes: '强调早买的好处，制造紧迫感但不要过度', category: '需求挖掘', children: [
          { id: 'c1_2_1', title: '关注健康保障', script: '健康保障是家庭的第一道防线。我建议优先配置重疾险+医疗险的组合，这样无论大病小病都有保障。', notes: '推荐重疾+医疗的经典组合', category: '产品推荐', children: [] },
          { id: 'c1_2_2', title: '关注养老规划', script: '养老规划确实很重要，越早开始压力越小。我们有一款年金险产品，可以帮您实现稳定的退休收入，同时还有身故保障。', notes: '推荐年金险，强调长期收益', category: '产品推荐', children: [] },
          { id: 'c1_2_3', title: '关注子女教育', script: '子女教育是每个家庭的大事。我们的教育金保险可以确保无论未来发生什么，孩子的教育费用都有保障。', notes: '推荐教育金保险，强调确定性', category: '产品推荐', children: [] }
        ]}
      ]},
      { id: 'c2', title: '客户犹豫/再考虑', script: '我完全理解您的顾虑，买保险确实需要慎重考虑。不如我们先把您的需求理清楚，您觉得合适再做决定。', notes: '不要施压，先帮客户理清需求', category: '异议处理', children: [
        { id: 'c2_1', title: '预算有限', script: '预算确实需要合理规划。我们可以根据您的预算来定制方案，先配置最核心的保障，等预算宽裕了再逐步完善。', notes: '提供灵活方案，降低客户心理门槛', category: '异议处理', children: [] },
        { id: 'c2_2', title: '对产品不放心', script: '您的担心很正常。我们公司是正规持牌机构，所有产品都在银保监会备案。我可以把产品条款发给您，您可以仔细查看，有任何疑问我随时解答。', notes: '用合规性打消顾虑，提供条款文件', category: '异议处理', children: [] },
        { id: 'c2_3', title: '家人不同意', script: '家人的意见很重要。要不您方便的时候，我们一起跟家人沟通一下？我可以当面解答他们的疑问，这样大家都能放心。', notes: '主动提出与家人沟通，展现专业和诚意', category: '异议处理', children: [] }
      ]},
      { id: 'c3', title: '客户拒绝/不需要', script: '没关系，我理解。不过保障规划是一辈子的事，如果以后您有任何保险方面的问题，随时可以找我咨询。', notes: '保持友好，给客户留好退路，为后续跟进做铺垫', category: '结束', children: [
        { id: 'c3_1', title: '客户同意加微信', script: '好的，我加您微信，以后有好的产品或者优惠活动我会第一时间通知您。另外我朋友圈也会定期分享一些保险知识，对您应该有帮助。', notes: '加微信后持续经营，朋友圈内容营销', category: '结束', children: [] },
        { id: 'c3_2', title: '客户拒绝加微信', script: '没问题，那您记一下我的电话，有需要随时联系我。祝您生活愉快！', notes: '礼貌结束，留下联系方式', category: '结束', children: [] }
      ]}
    ]
  };
}

/* 构建节点映射 */
function ssBuildNodeMap() {
  ssNodeMap = {};
  function walk(node) {
    if (!node) return;
    ssNodeMap[node.id] = node;
    if (node.children) node.children.forEach(walk);
  }
  walk(ssData);
}

/* 获取节点路径 */
function ssGetNodePath(targetId) {
  var path = [];
  function find(node, chain) {
    if (!node) return false;
    var newChain = chain.concat([node]);
    if (node.id === targetId) { path = newChain; return true; }
    if (node.children) {
      for (var i = 0; i < node.children.length; i++) {
        if (find(node.children[i], newChain)) return true;
      }
    }
    return false;
  }
  find(ssData, []);
  return path;
}

/* 加载数据（云端优先，本地兜底） */
function ssLoadData() {
  var raw = localStorage.getItem(SS_STORAGE_KEY);
  if (raw) {
    try { ssData = JSON.parse(raw); } catch(e) { ssData = ssGetDefaultData(); }
  } else {
    ssData = ssGetDefaultData();
    ssSaveData();
  }
  ssBuildNodeMap();
}

/* 云端话术拉取（登录后调用一次：云端较新则覆盖本地） */
async function ssSyncFromCloud() {
  try {
    if (typeof supabaseLoadScripts !== 'function') return;
    if (!currentSessionToken || !currentUserId) return;
    var cloud = await supabaseLoadScripts();
    if (!cloud || !cloud.id) return;
    /* 云端有数据：比较版本，云端新则覆盖本地 */
    var cloudTs = cloud._syncTs || '';
    var localTs = localStorage.getItem(SS_STORAGE_KEY + '_ts') || '';
    if (cloudTs && cloudTs > localTs) {
      var backup = { id: cloud.id, title: cloud.title, script: cloud.script, notes: cloud.notes, category: cloud.category, children: cloud.children || [] };
      /* 保留云端附带的元数据字段 */
      Object.keys(cloud).forEach(function(k) {
        if (k === 'children') return;
        backup[k] = cloud[k];
      });
      ssData = backup;
      ssSaveData(true);
      ssBuildNodeMap();
      if (ssPanelOpen) { ssRenderTree(); ssRenderScriptContent(); }
      console.log('[话术] 已从云端同步最新话术数据');
    } else if (!localStorage.getItem(SS_STORAGE_KEY)) {
      /* 本地为空直接采用云端 */
      ssData = cloud;
      ssSaveData(true);
      ssBuildNodeMap();
    }
  } catch (e) {
    console.warn('[话术] 云端同步失败（本地存储不受影响）:', e.message);
  }
}

/* 保存数据（本地立即 + 云端防抖） */
var _ssCloudSyncTimer = null;
function ssSaveData(skipCloud) {
  localStorage.setItem(SS_STORAGE_KEY, JSON.stringify(ssData));
  localStorage.setItem(SS_STORAGE_KEY + '_ts', new Date().toISOString());
  if (skipCloud) return;
  /* 防抖推送云端：编辑密集时 3 秒内只推一次 */
  if (_ssCloudSyncTimer) clearTimeout(_ssCloudSyncTimer);
  _ssCloudSyncTimer = setTimeout(function() {
    if (typeof supabaseSaveScripts === 'function') {
      try {
        var payload = JSON.parse(JSON.stringify(ssData));
        payload._syncTs = new Date().toISOString();
        supabaseSaveScripts(payload);
      } catch (e) { console.warn('[话术] 云端推送失败:', e.message); }
    }
  }, 3000);
}

/* 初始化话术工具 */
function ssInit() {
  ssLoadData();
  ssRenderTree();
  if (ssData) {
    ssSelectNode(ssData.id);
  }
}

/* 渲染树 */
function ssRenderTree() {
  var container = document.getElementById('ssTreeContainer');
  if (!container) return;
  container.innerHTML = '';
  if (!ssData) {
    container.innerHTML = '<div class="ss-empty"><div class="ss-empty-icon">📋</div><p>暂无话术数据</p></div>';
    return;
  }
  ssRenderNode(ssData, container, true);
}

/* 渲染单个节点 */
function ssRenderNode(node, parent, isRoot) {
  var item = document.createElement('div');
  item.className = 'ss-node-item' + (node.id === ssCurrentNodeId ? ' active' : '');
  item.setAttribute('data-ss-id', node.id);

  var preview = node.script ? node.script.substring(0, 40) + '...' : '';

  item.innerHTML = '<div class="ss-node-card' + (isRoot ? ' root-card' : '') + '" onclick="ssSelectNode(\'' + node.id + '\')">' +
    '<div class="ss-node-title">' + (isRoot ? '🏠 ' : '') + ssEscapeHtml(node.title || '未命名') + '</div>' +
    (preview ? '<div class="ss-node-preview">' + ssEscapeHtml(preview) + '</div>' : '') +
    '<div class="ss-node-actions">' +
    '<button class="ss-btn-edit" onclick="event.stopPropagation();ssEditNode(\'' + node.id + '\')">编辑</button>' +
    '<button class="ss-btn-add" onclick="event.stopPropagation();ssAddChildNode(\'' + node.id + '\')">+ 添加子节点</button>' +
    (isRoot ? '' : '<button class="ss-btn-del" onclick="event.stopPropagation();ssDeleteNode(\'' + node.id + '\')">删除</button>') +
    '</div></div>';

  parent.appendChild(item);

  if (node.children && node.children.length > 0) {
    var group = document.createElement('div');
    group.className = 'ss-node-group';
    node.children.forEach(function(child) {
      ssRenderNode(child, group, false);
    });
    parent.appendChild(group);
  }
}

/* 选中节点（若在客户详情页，自动记忆该客户的进度） */
function ssSelectNode(nodeId) {
  ssCurrentNodeId = nodeId;
  ssBuildNodeMap();
  ssRenderTree();
  ssRenderScriptContent();
  ssSaveClientTracking(nodeId);
}

/* ======== 客户绑定：话术进度记忆 ======== */

/* 判断当前是否在客户详情视图 */
function ssInClientDetail() {
  try {
    return selectedClientIdx >= 0 &&
           currentTab === 'query' &&
           document.getElementById('clientDetailView') &&
           document.getElementById('clientDetailView').style.display !== 'none';
  } catch (e) { return false; }
}

/* 记录当前客户的话术进度（本地立即保存，云端走 savePolicyData 防抖） */
var _ssTrackingTimer = null;
function ssSaveClientTracking(nodeId) {
  if (!ssInClientDetail()) return;
  var c = clientData[selectedClientIdx];
  if (!c) return;
  if (!c.scriptTracking) c.scriptTracking = {};
  c.scriptTracking.currentNodeId = nodeId;
  c.scriptTracking.lastUsedAt = new Date().toISOString();

  /* 路径历史：记录最近走过的节点标题链（最多20条） */
  var node = ssNodeMap[nodeId];
  if (node) {
    if (!c.scriptTracking.pathHistory) c.scriptTracking.pathHistory = [];
    /* 避免重复连续记录同一节点 */
    var last = c.scriptTracking.pathHistory[c.scriptTracking.pathHistory.length - 1];
    if (!last || last.id !== nodeId) {
      c.scriptTracking.pathHistory.push({ id: nodeId, title: node.title, at: c.scriptTracking.lastUsedAt });
      if (c.scriptTracking.pathHistory.length > 20) {
        c.scriptTracking.pathHistory = c.scriptTracking.pathHistory.slice(-20);
      }
    }
  }

  /* 防抖持久化：每次点击节点只延迟保存一次，避免频繁触发云同步 */
  if (_ssTrackingTimer) clearTimeout(_ssTrackingTimer);
  _ssTrackingTimer = setTimeout(function() {
    try { savePolicyData(); } catch (e) { console.warn('[话术] 进度保存失败:', e.message); }
  }, 2500);
}

/* 恢复客户的话术进度（打开面板/切换客户时调用） */
function ssRestoreClientTracking() {
  if (!ssInClientDetail() || !ssData) return;
  var c = clientData[selectedClientIdx];
  if (!c || !c.scriptTracking || !c.scriptTracking.currentNodeId) return;
  var remembered = c.scriptTracking.currentNodeId;
  ssBuildNodeMap();
  /* 记忆的节点仍存在才恢复，否则回到根节点 */
  if (ssNodeMap[remembered]) {
    ssCurrentNodeId = remembered;
    ssRenderTree();
    ssRenderScriptContent();
    /* ssInit 可能刚把进度重置为根节点，这里补写回记忆值 */
    ssSaveClientTracking(remembered);
  }
}

/* 客户详情页切换时：话术面板若已打开，跟随切换到新客户的进度 */
function ssOnClientChanged() {
  if (!ssPanelOpen || !ssData) return;
  ssRestoreClientTracking();
}

/* ======== 一键插入跟进记录 ======== */

/* 话术分类 → 联系状态推荐映射 */
function ssCategoryToStatus(category) {
  switch (category) {
    case '开场': return '已电话联系';
    case '需求挖掘': return '已电话联系';
    case '产品介绍': return '已电话联系';
    case '产品推荐': return '已加微信';
    case '异议处理': return '已电话联系';
    case '结束': return '已电话联系';
    default: return '已电话联系';
  }
}

/* 生成话术跟进备注文本 */
function ssBuildFollowUpNote(node) {
  var path = ssGetNodePath(node.id);
  var pathTitles = path.map(function(n) { return n.title; });
  var lines = [];
  lines.push('【话术跟进】' + (node.category || '') + ' - ' + node.title);
  if (pathTitles.length > 1) {
    lines.push('路径：' + pathTitles.join(' › '));
  }
  if (node.script) {
    var summary = node.script.length > 80 ? node.script.substring(0, 80) + '...' : node.script;
    lines.push('核心内容：' + summary);
  }
  return lines.join('\n');
}

/* 点击「记录本次话术跟进」：预填联系记录模态框 */
function ssInsertFollowUpRecord() {
  if (!ssInClientDetail()) { ssShowToast('请先在客户详情页操作'); return; }
  var node = ssNodeMap[ssCurrentNodeId];
  if (!node) { ssShowToast('未选择话术节点'); return; }

  /* 预填现有联系记录模态框 */
  var statusEl = document.getElementById('contactStatus');
  var noteEl = document.getElementById('contactNote');
  var dateEl = document.getElementById('contactDate');
  if (!statusEl || !noteEl || !dateEl) { ssShowToast('联系记录组件未就绪'); return; }

  dateEl.value = new Date().toISOString().slice(0, 10);
  var recommended = ssCategoryToStatus(node.category);
  /* 若下拉框有该选项则选中 */
  var hasOption = false;
  for (var i = 0; i < statusEl.options.length; i++) {
    if (statusEl.options[i].value === recommended) { hasOption = true; break; }
  }
  statusEl.value = hasOption ? recommended : statusEl.options[0].value;
  noteEl.value = ssBuildFollowUpNote(node);

  openModal('contactModal');
  /* 聚焦备注方便微调 */
  setTimeout(function() { try { noteEl.focus(); noteEl.setSelectionRange(noteEl.value.length, noteEl.value.length); } catch(e) {} }, 100);
}

/* 移动端：折叠/展开话术树 */
function ssToggleTree() {
  var treePanel = document.getElementById('ssTreePanel');
  var toggle = document.getElementById('ssTreeToggle');
  if (!treePanel || !toggle) return;
  treePanel.classList.toggle('expanded');
  if (treePanel.classList.contains('expanded')) {
    toggle.textContent = '▲';
  } else {
    toggle.textContent = '▼';
  }
}

/* 渲染话术内容 */
function ssRenderScriptContent() {
  var area = document.getElementById('ssScriptContent');
  if (!area) return;

  var node = ssNodeMap[ssCurrentNodeId];
  if (!node) {
    area.innerHTML = '<div class="ss-empty"><div class="ss-empty-icon">📋</div><p>请选择话术节点</p></div>';
    return;
  }

  var path = ssGetNodePath(ssCurrentNodeId);
  var html = '';

  /* 面包屑 */
  if (path.length > 0) {
    html += '<div class="ss-breadcrumb">';
    var bcParts = [];
    for (var i = 0; i < path.length; i++) {
      bcParts.push('<span style="cursor:pointer;color:#d4a017;font-weight:600;" onclick="ssSelectNode(\'' + path[i].id + '\')">' + ssEscapeHtml(path[i].title) + '</span>');
    }
    html += bcParts.join(' <span class="ss-bc-sep">›</span>');
    html += '</div>';
  }

  /* 当前话术指示 + 编辑按钮 */
  html += '<div class="ss-step-indicator"><span class="ss-step-dot"></span>当前话术 ' +
    '<button class="ss-inline-edit-btn" onclick="ssEditNode(\'' + ssCurrentNodeId + '\')" title="编辑此节点">✏️ 编辑</button></div>';

  /* 分类 */
  if (node.category) {
    html += '<div class="ss-section"><div class="ss-label">分类：' + ssEscapeHtml(node.category) + '</div></div>';
  }

  /* 话术内容 */
  html += '<div class="ss-section"><div class="ss-label">话术内容</div>' +
    '<div class="ss-script-box"><div class="ss-script-text">' + ssEscapeHtml(node.script || '') + '</div></div></div>';

  /* 备注 */
  if (node.notes) {
    html += '<div class="ss-section"><div class="ss-notes-box">' + ssEscapeHtml(node.notes) + '</div></div>';
  }

  /* ★ 一键插入跟进记录（仅在客户详情视图显示） */
  if (ssInClientDetail()) {
    var clientName = '';
    try { clientName = clientData[selectedClientIdx] ? (clientData[selectedClientIdx].clientName || clientData[selectedClientIdx].name || '客户') : ''; } catch(e) {}
    var hasHistory = false;
    try {
      var cc = clientData[selectedClientIdx];
      hasHistory = !!(cc && cc.scriptTracking && cc.scriptTracking.pathHistory && cc.scriptTracking.pathHistory.length);
    } catch(e) {}
    html += '<div class="ss-section">' +
      '<button class="ss-insert-followup-btn" onclick="ssInsertFollowUpRecord()">' +
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>' +
      '记录本次话术跟进' + (clientName ? '（' + ssEscapeHtml(clientName) + '）' : '') +
      '</button>' +
      (hasHistory ? '<div class="ss-followup-hint">已为该客户记录过话术进度，插入后可在联系记录时间线查看</div>' : '') +
      '</div>';
  }

  /* 客户回答按钮 */
  if (node.children && node.children.length > 0) {
    html += '<div class="ss-section"><div class="ss-label">客户回答</div><div class="ss-response-btns">';
    node.children.forEach(function(child) {
      var cls = 'ss-neutral';
      if (child.category === '产品推荐' || child.category === '结束') cls = 'ss-positive';
      else if (child.category === '异议处理') cls = 'ss-negative';
      var targetId = child.jumpTo || child.id;
      html += '<div class="ss-response-item">' +
        '<button class="ss-response-btn ' + cls + '" onclick="ssSelectNode(\'' + targetId + '\')">' +
        ssEscapeHtml(child.title) + '</button>' +
        '<button class="ss-inline-edit-btn ss-inline-edit-sm" onclick="event.stopPropagation();ssEditNode(\'' + child.id + '\')" title="编辑此回答">✏️</button>' +
        '</div>';
    });
    html += '</div></div>';
  } else {
    html += '<div class="ss-section" style="text-align:center;padding:20px;color:#9c9590;">🎯 话术终点</div>';
  }

  /* 底部导航 */
  html += '<div class="ss-nav-row">' +
    '<button class="ss-nav-btn" onclick="ssResetToRoot()">🏠 回到起点</button>';
  if (path.length > 1) {
    var parentId = path[path.length - 2].id;
    html += '<button class="ss-nav-btn" onclick="ssSelectNode(\'' + parentId + '\')">← 返回上一级</button>';
  }
  html += '</div>';

  area.innerHTML = html;
}

/* 切换编辑模式 */
function ssToggleEditMode() {
  ssEditMode = !ssEditMode;
  var btn = document.getElementById('ssBtnEditMode');
  var treePanel = document.getElementById('ssTreePanel');
  var addRootBtn = document.getElementById('ssBtnAddRoot');

  if (ssEditMode) {
    btn.textContent = '退出编辑';
    btn.className = 'sp-btn sp-btn-primary';
    treePanel.classList.add('ss-edit-mode');
    if (addRootBtn) addRootBtn.style.display = 'inline-block';
  } else {
    btn.textContent = '编辑模式';
    btn.className = 'sp-btn';
    treePanel.classList.remove('ss-edit-mode');
    if (addRootBtn) addRootBtn.style.display = 'none';
  }
  ssRenderTree();
  ssRenderScriptContent();
}

/* 编辑节点 */
function ssEditNode(nodeId) {
  ssShowNodeModal(null, nodeId);
}

/* 添加根节点 */
function ssAddRootNode() {
  ssShowNodeModal(null, null);
}

/* 添加子节点 */
function ssAddChildNode(parentId) {
  ssShowNodeModal(parentId, null);
}

/* 删除节点 */
function ssDeleteNode(nodeId) {
  if (nodeId === 'root' || (ssData && ssData.id === nodeId)) {
    ssShowToast('根节点不能删除');
    return;
  }
  if (!confirm('确定要删除该节点及其所有子节点吗？')) return;

  function remove(parent, targetId) {
    if (!parent || !parent.children) return false;
    for (var i = 0; i < parent.children.length; i++) {
      if (parent.children[i].id === targetId) {
        parent.children.splice(i, 1);
        return true;
      }
      if (remove(parent.children[i], targetId)) return true;
    }
    return false;
  }
  remove(ssData, nodeId);

  if (ssCurrentNodeId === nodeId) {
    ssCurrentNodeId = ssData ? ssData.id : null;
  }
  ssSaveData();
  ssBuildNodeMap();
  ssRenderTree();
  ssRenderScriptContent();
}

/* 显示节点编辑模态框 */
function ssShowNodeModal(parentId, editNodeId) {
  var modal = document.getElementById('ssModalOverlay');
  var box = document.getElementById('ssModalBox');
  var isEdit = !!editNodeId;
  var node = isEdit ? ssNodeMap[editNodeId] : null;
  var isChild = !!parentId && !isEdit; // 添加子节点（非编辑模式）

  var modalTitle = isEdit ? '编辑节点' : (parentId ? '添加客户回答' : '添加根节点');
  var nodeTitle = isEdit ? (node ? node.title : '') : '';
  var script = isEdit ? (node ? node.script : '') : '';
  var notes = isEdit ? (node ? node.notes : '') : '';
  var category = isEdit ? (node ? node.category : '') : '';
  var jumpTo = isEdit ? (node ? (node.jumpTo || '') : '') : '';

  // 构建所有节点列表（用于跳转目标选择）
  var allNodeOptions = '<option value="">— 默认（子节点本身）—</option>';
  function collectNodes(n, depth) {
    if (!n) return;
    var prefix = '';
    for (var d = 0; d < depth; d++) prefix += '  ';
    if (n.id !== editNodeId) {
      allNodeOptions += '<option value="' + n.id + '"' + (jumpTo === n.id ? ' selected' : '') + '>' + prefix + ssEscapeHtml(n.title) + '</option>';
    }
    if (n.children) n.children.forEach(function(c) { collectNodes(c, depth + 1); });
  }
  collectNodes(ssData, 0);

  var html = '<h3>' + modalTitle + '</h3>';

  // 添加子节点时：标题就是客户回答文本
  if (isChild) {
    html += '<div class="ss-form-group"><label>客户回答文本</label><input id="ssModalTitle" value="" placeholder="如：是 / 客户感兴趣 / 预算有限..."></div>';
  } else {
    html += '<div class="ss-form-group"><label>标题</label><input id="ssModalTitle" value="' + ssEscapeHtml(nodeTitle) + '" placeholder="节点标题"></div>';
  }

  html += '<div class="ss-form-group"><label>话术内容</label><textarea id="ssModalScript" placeholder="输入话术内容...">' + ssEscapeHtml(script) + '</textarea></div>' +
    '<div class="ss-form-group"><label>备注/提示</label><textarea id="ssModalNotes" placeholder="输入备注...">' + ssEscapeHtml(notes) + '</textarea></div>';

  // 添加子节点时不显示分类
  if (!isChild) {
    var cats = ['开场', '需求挖掘', '产品介绍', '产品推荐', '异议处理', '结束', '其他'];
    var catOptions = '';
    cats.forEach(function(c) {
      catOptions += '<option value="' + c + '"' + (category === c ? ' selected' : '') + '>' + c + '</option>';
    });
    html += '<div class="ss-form-group"><label>分类</label><select id="ssModalCategory">' + catOptions + '</select></div>';
  }

  // 编辑模式时显示跳转目标
  if (isEdit) {
    html += '<div class="ss-form-group"><label>回答后跳转到（可选）</label><select id="ssModalJumpTo">' + allNodeOptions + '</select>' +
      '<div style="font-size:11px;color:#9c9590;margin-top:4px;">默认跳转到子节点本身，可指定跳转到树中任意节点</div></div>';
  }

  html += '<div class="ss-form-actions">' +
    '<button class="sp-btn" onclick="ssCloseModal()">取消</button>' +
    '<button class="sp-btn sp-btn-primary" onclick="ssSaveNodeModal(\'' + (parentId || '') + '\',\'' + (editNodeId || '') + '\')">保存</button>' +
    '</div>';

  box.innerHTML = html;
  modal.classList.add('open');
}

/* 关闭模态框 */
function ssCloseModal() {
  document.getElementById('ssModalOverlay').classList.remove('open');
}

/* 保存节点 */
function ssSaveNodeModal(parentId, editNodeId) {
  var title = document.getElementById('ssModalTitle').value.trim();
  var script = document.getElementById('ssModalScript').value.trim();
  var notes = document.getElementById('ssModalNotes').value.trim();
  var categoryEl = document.getElementById('ssModalCategory');
  var category = categoryEl ? categoryEl.value : '';
  var jumpToEl = document.getElementById('ssModalJumpTo');
  var jumpTo = jumpToEl ? jumpToEl.value : '';

  if (!title) { ssShowToast('请输入标题'); return; }
  if (!script) { ssShowToast('请输入话术内容'); return; }

  if (editNodeId) {
    var node = ssNodeMap[editNodeId];
    if (node) {
      node.title = title;
      node.script = script;
      node.notes = notes;
      if (category) node.category = category;
      node.jumpTo = jumpTo || undefined;
    }
  } else {
    // 添加子节点时，自动继承父节点分类
    if (parentId && !category) {
      var pNode = ssNodeMap[parentId];
      if (pNode && pNode.category) category = pNode.category;
    }
    var newNode = {
      id: 'n_' + Date.now(),
      title: title,
      script: script,
      notes: notes,
      category: category,
      children: []
    };
    if (parentId) {
      var parentNode = ssNodeMap[parentId];
      if (parentNode) {
        if (!parentNode.children) parentNode.children = [];
        parentNode.children.push(newNode);
      }
    } else {
      ssData = newNode;
    }
  }

  ssSaveData();
  ssBuildNodeMap();
  ssCloseModal();
  ssRenderTree();
  ssRenderScriptContent();
}

/* 回到根节点 */
function ssResetToRoot() {
  if (ssData) {
    ssSelectNode(ssData.id);
  }
}

/* 切换面板显示 */
function toggleScriptPanel() {
  var overlay = document.getElementById('scriptOverlay');
  ssPanelOpen = !ssPanelOpen;
  if (ssPanelOpen) {
    overlay.classList.add('open');
    var panelW = window.innerWidth > 768 ? Math.min(820, window.innerWidth * 0.95) : 0;
    if (panelW > 0) {
      document.body.style.paddingRight = panelW + 'px';
      document.body.style.transition = 'padding-right 0.3s var(--ease-out)';
    }
    if (!ssData) {
      ssInit();
    } else {
      ssRenderTree();
      ssRenderScriptContent();
    }
    /* ★ 打开面板时恢复当前客户的话术进度 */
    ssRestoreClientTracking();
  } else {
    overlay.classList.remove('open');
    document.body.style.paddingRight = '';
    document.body.style.transition = 'padding-right 0.3s var(--ease-out)';
  }
}

/* 关闭弹窗（点击遮罩） */
document.addEventListener('click', function(e) {
  if (e.target.id === 'ssModalOverlay') {
    ssCloseModal();
  }
});

/* 显示话术工具按钮 */
function showScriptToggleBtn() {
  var btn = document.getElementById('scriptToggleBtn');
  if (btn) { btn.classList.remove('hidden'); btn.style.display = 'block'; }
}

/* 隐藏话术工具按钮 */
function hideScriptToggleBtn() {
  var btn = document.getElementById('scriptToggleBtn');
  if (btn) { btn.classList.add('hidden'); btn.style.display = 'none'; }
}

/* 简单的 toast 提示 */
function ssShowToast(msg) {
  var toast = document.createElement('div');
  toast.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:9999;background:#2d2b28;color:#fff;padding:10px 24px;border-radius:10px;font-size:14px;font-weight:600;box-shadow:0 8px 30px rgba(0,0,0,0.3);animation:ssFadeInOut 2s forwards;';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(function() { toast.remove(); }, 2000);
}

/* 工具函数 */
function ssEscapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* 窗口大小变化时自适应面板留白 */
window.addEventListener('resize', function() {
  if (ssPanelOpen) {
    var panelW = window.innerWidth > 768 ? Math.min(820, window.innerWidth * 0.95) : 0;
    document.body.style.paddingRight = panelW > 0 ? panelW + 'px' : '';
  }
});

/* ======== 初始化 ======== */

/* 初始化管理员账号 */
function initAdmin() {
  var users = getUsers();
  var admin = users.find(function(u) { return u.username === 'admin'; });
  if (!admin) {
    users.push({
      username: 'admin',
      passwordHash: simpleHash('admin888'),
      createdAt: new Date().toISOString(),
      lastLogin: null
    });
    saveUsers(users);
  }
}

/* 检查登录状态：优先从 Supabase 会话恢复 */
async function checkLogin() {
  try {
    var uid = await loadSessionOrNull();
    if (uid) {
      enterMainApp();
      return;
    }
  } catch(e) {
    console.warn('[checkLogin] 会话恢复异常:', e);
  }
  /* 兜底：兼容旧版 pms_currentUser（保留的话）*/
  var saved = localStorage.getItem('pms_currentUser');
  if (saved) {
    var users = getUsers();
    if (users.find(function(u) { return u.username === saved; })) {
      currentUser = saved;
      enterMainApp();
      return;
    }
  }
  var ap = document.getElementById('authPage');
  if (ap) ap.style.display = 'flex';
}

/* 关闭模态框（点击遮罩层） */
function _bindModalCloseOnOverlay() {
  document.querySelectorAll('.modal-overlay').forEach(function(overlay) {
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) {
        overlay.classList.remove('show');
      }
    });
  });
}

/* 启动应用：确保DOM完全就绪后执行 */
function _bootstrapApp() {
  initAdmin();
  _bindModalCloseOnOverlay();
  checkLogin(); /* checkLogin 是 async，返回的 Promise 我们不必 await，让它在后台恢复会话 */
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _bootstrapApp);
} else {
  _bootstrapApp();
}


