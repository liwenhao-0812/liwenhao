/* ======== Tab切换 ======== */
function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.nav-item').forEach(function(n) {
    n.classList.toggle('active', n.dataset.tab === tab);
  });
  document.querySelectorAll('.tab-content').forEach(function(tc) {
    tc.classList.remove('active');
  });
  var el = document.getElementById('tab' + tab.charAt(0).toUpperCase() + tab.slice(1));
  if (el) el.classList.add('active');

  /* 切换到查询页时重置为列表视图 */
  if (tab === 'query') {
    var listView = document.getElementById('queryListView');
    var detailView = document.getElementById('clientDetailView');
    if (listView) listView.style.display = 'block';
    if (detailView) detailView.style.display = 'none';
    selectedClientIdx = -1;
  } else {
    hideScriptToggleBtn();
    if (ssPanelOpen) toggleScriptPanel();
  }

  refreshCurrentTab();
}

/* 刷新当前Tab内容 */
function refreshCurrentTab() {
  switch(currentTab) {
    case 'home': renderDashboard(); break;
    case 'query': handleSearch(); break;
    case 'inslib': renderInsuranceTypeLib(); break;
    case 'settings': updateSettingSyncStatus(hasGitHubToken()); initTokenStatus(); initSupabaseStatus(); break;
  }
  updateBottomStats();
}

/* 更新底部统计 */
function updateBottomStats() {
  var totalClients = clientData.length;
  var totalPolicies = 0;
  clientData.forEach(function(c) { totalPolicies += (c.policies || []).length; });
  document.getElementById('bottomStats').textContent =
    '客户: ' + totalClients + ' | 保单: ' + totalPolicies;
}

/* ======== 首页 - 仪表盘 ======== */
function renderDashboard() {
  var totalClients = clientData.length;
  var totalPolicies = 0;
  var validPolicies = 0;
  var expiredPolicies = 0;
  var totalPremium = 0;
  var totalSum = 0;
  var monthNew = 0;
  var now = new Date();
  var thisMonth = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');

  /* 险种统计 */
  var typeMap = {};
  clientData.forEach(function(c) {
    (c.policies || []).forEach(function(p) {
      totalPolicies++;
      if (p.status === '有效') validPolicies++;
      else expiredPolicies++;
      totalPremium += parseFloat(p.annualPremium) || 0;
      totalSum += parseFloat(p.sumInsured) || 0;
      /* 本月新增判断 */
      if (p.effectiveDate && p.effectiveDate.startsWith(thisMonth)) monthNew++;
      /* 险种统计 */
      var type = p.insuranceName || '未分类';
      typeMap[type] = (typeMap[type] || 0) + 1;
    });
  });

  var statsHtml = '' +
    '<div class="stat-card"><div class="stat-value">' + totalClients + '</div><div class="stat-label">总客户数</div></div>' +
    '<div class="stat-card"><div class="stat-value">' + totalPolicies + '</div><div class="stat-label">总保单数</div></div>' +
    '<div class="stat-card green"><div class="stat-value">' + validPolicies + '</div><div class="stat-label">有效保单</div></div>' +
    '<div class="stat-card red"><div class="stat-value">' + expiredPolicies + '</div><div class="stat-label">失效保单</div></div>' +
    '<div class="stat-card"><div class="stat-value">' + formatMoney(totalPremium) + '</div><div class="stat-label">总年缴保费（元）</div></div>' +
    '<div class="stat-card"><div class="stat-value">' + formatMoney(totalSum) + '</div><div class="stat-label">总保额（元）</div></div>' +
    '<div class="stat-card yellow"><div class="stat-value">' + monthNew + '</div><div class="stat-label">本月新增保单</div></div>';
  document.getElementById('dashboardStats').innerHTML = statsHtml;

  /* 生存金到期提醒（30天内） */
  var survivalAlerts = [];
  var today = new Date();
  today.setHours(0,0,0,0);
  clientData.forEach(function(c) {
    (c.policies || []).forEach(function(p) {
      if (p.survivalBenefit && p.survivalBenefit.type && p.survivalBenefit.nextDate) {
        var nd = p.survivalBenefit.nextDate;
        var nextDateObj = new Date(nd.substring(0,4) + '-' + nd.substring(4,6) + '-' + nd.substring(6,8));
        var diffDays = Math.ceil((nextDateObj - today) / 86400000);
        if (diffDays <= 30 && diffDays >= 0) {
          survivalAlerts.push({
            clientName: c.name || '',
            policyCode: p.policyCode || '',
            insuranceName: p.insuranceName || '',
            amount: p.survivalBenefit.amount || 0,
            nextDate: formatDate(nd),
            daysLeft: diffDays
          });
        }
      }
    });
  });
  var survivalAlertHtml = '';
  if (survivalAlerts.length > 0) {
    survivalAlertHtml = '<div class="card" style="border:2px solid #ef4444;"><div class="card-title" style="color:#dc2626;border-bottom-color:#ef4444;">⚠ 生存金即将到期提醒（30天内）</div>';
    survivalAlerts.forEach(function(a) {
      survivalAlertHtml += '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px;background:#fef2f2;border-radius:8px;margin-bottom:6px;flex-wrap:wrap;gap:8px;">' +
        '<div><strong>' + a.clientName + '</strong> - ' + a.insuranceName + ' (' + a.policyCode + ')</div>' +
        '<div style="display:flex;align-items:center;gap:12px;">' +
        '<span style="font-weight:700;color:#0f172a;">' + formatMoney(a.amount) + ' 元</span>' +
        '<span style="font-weight:700;color:#dc2626;">' + a.nextDate + '</span>' +
        '<span class="tag tag-red">仅剩 ' + a.daysLeft + ' 天</span>' +
        '</div></div>';
    });
    survivalAlertHtml += '</div>';
  }

  /* 险种分布 - 简易柱状图 */
  var chartHtml = '<div style="overflow-x:auto;padding-bottom:8px;"><div style="display:flex;flex-wrap:wrap;gap:16px;align-items:flex-end;min-height:200px;padding:10px 4px 4px;">';
  var maxCount = 1;
  Object.values(typeMap).forEach(function(v) { if (v > maxCount) maxCount = v; });
  Object.keys(typeMap).sort(function(a,b) { return typeMap[b] - typeMap[a]; }).forEach(function(type) {
    var count = typeMap[type];
    var pct = Math.round(count / maxCount * 140);
    chartHtml += '<div style="display:flex;flex-direction:column;align-items:center;gap:4px;min-width:64px;">' +
      '<div style="font-size:12px;font-weight:600;color:#1e40af;">' + count + '</div>' +
      '<div style="width:42px;height:' + pct + 'px;background:linear-gradient(to top,#3b82f6,#60a5fa);border-radius:6px 6px 0 0;transition:height 0.3s;min-height:4px;"></div>' +
      '<div style="font-size:11px;color:#64748b;max-width:64px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + type + '">' + type + '</div>' +
      '</div>';
  });
  chartHtml += '</div></div>';
  document.getElementById('insuranceTypeChart').innerHTML = chartHtml || '<div class="empty-state"><p>暂无数据</p></div>';

  /* 生存金提醒 */
  document.getElementById('survivalAlertContainer').innerHTML = survivalAlertHtml;

  /* 管理员面板 */
  if (currentUser === 'admin') {
    document.getElementById('adminPanel').classList.remove('hidden');
    renderAdminPanel();
  } else {
    document.getElementById('adminPanel').classList.add('hidden');
  }
}

/* 管理员面板 */
function renderAdminPanel() {
  var users = getUsers();
  var html = '';
  users.forEach(function(u) {
    var uData = secureGetItem('policy_data_' + u.username, u.username) || [];
    var policyCount = 0;
    uData.forEach(function(c) { policyCount += (c.policies || []).length; });
    html += '<div class="user-stat-card">' +
      '<div><strong>' + u.username + '</strong> ' +
      '<span class="tag tag-blue">' + (u.username === 'admin' ? '管理员' : '普通用户') + '</span></div>' +
      '<div style="font-size:13px;color:#64748b;">客户 ' + uData.length + ' | 保单 ' + policyCount +
      ' | 最后登录: ' + (u.lastLogin ? new Date(u.lastLogin).toLocaleString('zh-CN') : '从未') + '</div>' +
      '</div>';
  });
  document.getElementById('adminUserList').innerHTML = html || '<p>暂无用户数据</p>';
}

/* ======== 查询功能 ======== */

/* 清空搜索 */
function clearSearch() {
  document.getElementById('searchInput').value = '';
  document.getElementById('followUpFilter').value = 'all';
  handleSearch();
}

/* 执行搜索 - 支持姓名、地址、险种名称、险种代码模糊搜索 */
function handleSearch() {
  var keyword = document.getElementById('searchInput').value.trim().toLowerCase();

  /* 过滤客户 */
  var filtered = clientData.map(function(client, idx) {
    /* 过滤保单 */
    var matchedPolicies = (client.policies || []).filter(function(p) {
      /* 关键词搜索：投保人/被保人姓名、地址、险种名称、险种代码 */
      if (keyword) {
        var nameMatch = (client.name || '').toLowerCase().includes(keyword) ||
                        (p.insured || '').toLowerCase().includes(keyword);
        var addrMatch = (client.address || '').toLowerCase().includes(keyword) ||
                        (client.workAddress || '').toLowerCase().includes(keyword) ||
                        (p.insuredAddress || '').toLowerCase().includes(keyword);
        var insNameMatch = (p.insuranceName || '').toLowerCase().includes(keyword);
        var codeMatch = (p.codeType || '').toLowerCase().includes(keyword);
        if (!nameMatch && !addrMatch && !insNameMatch && !codeMatch) return false;
      }
      return true;
    });
    return { clientIdx: idx, client: client, matchedPolicies: matchedPolicies };
  }).filter(function(item) { return item.matchedPolicies.length > 0 || !keyword; });

  /* 跟进状态筛选 */
  var followUpFilter = document.getElementById('followUpFilter').value || 'all';
  if (followUpFilter !== 'all') {
    filtered = filtered.filter(function(item) {
      var c = item.client;
      var hasWechat = false;
      var hasMeeting = false;
      var latestContact = null;

      if (c.contactHistory && c.contactHistory.length > 0) {
        c.contactHistory.forEach(function(ch) {
          if (ch.status === '已加微信') hasWechat = true;
          if (ch.status === '面见客户') hasMeeting = true;
          if (!latestContact || ch.date > latestContact.date) {
            latestContact = ch;
          }
        });
      }

      if (followUpFilter === 'followUp') {
        /* 需跟进：最近一次联系状态为未联系上或电话挂断，或无联系记录 */
        return !latestContact || latestContact.status === '未联系上' || latestContact.status === '电话挂断';
      }

      if (followUpFilter === 'wechatNoMeeting') {
        /* 已加微信但未见面 */
        return hasWechat && !hasMeeting;
      }

      return true;
    });
  }

  /* 排序 */
  var sortBy = document.getElementById('sortSelect').value;
  filtered.sort(function(a, b) {
    switch(sortBy) {
      case 'name':
        return (a.client.name || '').localeCompare(b.client.name || '', 'zh-CN');
      case 'premium-desc':
        var aPrem = 0, bPrem = 0;
        a.matchedPolicies.forEach(function(p) { aPrem += parseFloat(p.annualPremium) || 0; });
        b.matchedPolicies.forEach(function(p) { bPrem += parseFloat(p.annualPremium) || 0; });
        return bPrem - aPrem;
      case 'premium-asc':
        var aP = 0, bP = 0;
        a.matchedPolicies.forEach(function(p) { aP += parseFloat(p.annualPremium) || 0; });
        b.matchedPolicies.forEach(function(p) { bP += parseFloat(p.annualPremium) || 0; });
        return aP - bP;
      case 'sumInsured-desc':
        var aS = 0, bS = 0;
        a.matchedPolicies.forEach(function(p) { aS += parseFloat(p.sumInsured) || 0; });
        b.matchedPolicies.forEach(function(p) { bS += parseFloat(p.sumInsured) || 0; });
        return bS - aS;
      case 'sumInsured-asc':
        var aS2 = 0, bS2 = 0;
        a.matchedPolicies.forEach(function(p) { aS2 += parseFloat(p.sumInsured) || 0; });
        b.matchedPolicies.forEach(function(p) { bS2 += parseFloat(p.sumInsured) || 0; });
        return aS2 - bS2;
      case 'date-desc':
        return (b.client.policies && b.client.policies[0] && b.client.policies[0].effectiveDate || '').localeCompare(a.client.policies && a.client.policies[0] && a.client.policies[0].effectiveDate || '');
      case 'date-asc':
        return (a.client.policies && a.client.policies[0] && a.client.policies[0].effectiveDate || '').localeCompare(b.client.policies && b.client.policies[0] && b.client.policies[0].effectiveDate || '');
      default: return 0;
    }
  });

  /* 二级排序：不继续服务 > 未联系 > 已联系 */
  /* 优先级：不继续服务排最后，未联系往前靠，已联系往后排 */
  filtered.sort(function(a, b) {
    var aDNC = a.client.doNotContact ? 1 : 0;
    var bDNC = b.client.doNotContact ? 1 : 0;
    if (aDNC !== bDNC) return aDNC - bDNC; /* 不继续服务的排最后 */
    var aHasContact = (a.client.contactHistory && a.client.contactHistory.length > 0) ? 1 : 0;
    var bHasContact = (b.client.contactHistory && b.client.contactHistory.length > 0) ? 1 : 0;
    return aHasContact - bHasContact; /* 未联系的(0)在前，已联系的(1)在后 */
  });

  /* 统计信息 */
  var totalPolicies = 0;
  filtered.forEach(function(item) { totalPolicies += item.matchedPolicies.length; });
  document.getElementById('searchResultInfo').textContent =
    '共找到 ' + filtered.length + ' 个客户，' + totalPolicies + ' 条保单';

  renderClientList(filtered);
}

/* 渲染客户列表 - 卡片式CRM布局 */
function renderClientList(filtered) {
  var html = '';
  if (filtered.length === 0) {
    html = '<div class="empty-state"><div class="empty-icon">&#128269;</div><p>未找到匹配的客户</p>' +
           '<button class="btn-primary" onclick="openAddClientModal()">添加新客户</button></div>';
  } else {
    filtered.forEach(function(item) {
      var c = item.client;
      var pCount = item.matchedPolicies.length;
      var vCount = item.matchedPolicies.filter(function(p) { return p.status === '有效'; }).length;
      var totalPrem = 0;
      item.matchedPolicies.forEach(function(p) { totalPrem += parseFloat(p.annualPremium) || 0; });
      var isActive = selectedClientIdx === item.clientIdx ? ' active' : '';

      /* 计算年龄 */
      var age = '';
      var idCard = c.idCard || '';
      if (idCard.length >= 14) {
        try {
          var by = parseInt(idCard.substring(6, 10));
          if (by > 1900 && by < 2100) {
            age = (new Date().getFullYear() - by) + '岁';
          }
        } catch(e) {}
      }
      var familyCount = (c.familyMembers || []).length;
      var address = c.address || '';

      /* 获取最新联系记录 */
      var latestContact = null;
      if (c.contactHistory && c.contactHistory.length > 0) {
        var sorted = c.contactHistory.slice().sort(function(a, b) {
          return (b.date || '').localeCompare(a.date || '');
        });
        latestContact = sorted[0];
      }

      /* 联系记录状态颜色 */
      var contactColor = '';
      var contactBg = '';
      if (latestContact) {
        var st = latestContact.status || '';
        if (st === '已加微信' || st === '已电话联系' || st === '面见客户') {
          contactColor = '#065f46'; contactBg = '#ecfdf5';
        } else if (st === '未联系上' || st === '电话挂断') {
          contactColor = '#991b1b'; contactBg = '#fef2f2';
        } else {
          contactColor = '#92400e'; contactBg = '#fffbeb';
        }
      }

      /* 计算生存金汇总 */
      var survivalTotal = 0;
      var survivalNextDate = '';
      item.matchedPolicies.forEach(function(p) {
        if (p.survivalBenefit && p.survivalBenefit.type) {
          survivalTotal += parseFloat(p.survivalBenefit.amount) || 0;
          var nd = p.survivalBenefit.nextDate || '';
          if (nd && (!survivalNextDate || nd < survivalNextDate)) {
            survivalNextDate = nd;
          }
        }
      });

      /* 不继续服务标记 */
      var isDNC = c.doNotContact === true;
      var dncStyle = isDNC ? ' opacity:0.6;' : '';

      html += '<div class="crm-client-card' + isActive + '" onclick="selectClient(' + item.clientIdx + ')" style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:12px;cursor:pointer;transition:all 0.25s;position:relative;' + dncStyle + '">';

      /* 顶部：姓名 + 保单数徽章 */
      html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">';
      html += '<div style="font-size:17px;font-weight:800;color:#0f172a;">' + (c.name || '未命名');
      if (hasIncompleteInfo(c)) {
        html += ' <span class="tag tag-red" style="font-size:10px;padding:2px 6px;vertical-align:middle;">信息不完整</span>';
      }
      /* 不继续服务标记 */
      if (isDNC) {
        html += ' <span class="tag tag-gray" style="font-size:10px;padding:2px 6px;vertical-align:middle;">不继续服务</span>';
      }
      html += '</div>';
      html += '<div style="background:#1a2744;color:#fff;border-radius:20px;min-width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;padding:0 10px;">' + pCount + '</div>';
      html += '</div>';

      /* 手机号 */
      html += '<div style="font-size:13px;color:#64748b;margin-bottom:4px;">' +
        (c.phone ? '📱 ' + (showSensitiveData ? c.phone : maskPhone(c.phone)) : '') + '</div>';

      /* 地址 */
      if (address) {
        html += '<div style="font-size:12px;color:#94a3b8;margin-bottom:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + address + '</div>';
      }

      /* 统计行：年龄、保单、家人 */
      html += '<div style="display:flex;gap:12px;font-size:12px;color:#64748b;margin-bottom:10px;flex-wrap:wrap;">';
      if (age) html += '<span>年龄：' + age + '</span>';
      html += '<span>保单：' + pCount + '份</span>';
      html += '<span>家人：' + familyCount + '人</span>';
      html += '<span>年保费：' + formatMoney(totalPrem) + '</span>';
      html += '</div>';

      /* 生存金信息 */
      if (survivalTotal > 0) {
        html += '<div style="display:flex;align-items:center;gap:10px;background:#fefce8;border:1px solid #fde68a;border-radius:8px;padding:6px 12px;margin-bottom:8px;font-size:12px;color:#92400e;">';
        html += '<span style="font-weight:700;">💰 生存金</span>';
        html += '<span>领取：' + formatMoney(survivalTotal) + '元</span>';
        if (survivalNextDate) {
          html += '<span style="margin-left:auto;">下次：' + formatDate(survivalNextDate) + '</span>';
        }
        html += '</div>';
      }

      /* 联系记录条 */
      if (latestContact) {
        html += '<div style="display:flex;align-items:center;gap:8px;background:' + contactBg + ';border-radius:8px;padding:8px 12px;font-size:13px;color:' + contactColor + ';font-weight:600;">';
        html += '<span style="font-size:16px;">📞</span>';
        html += '<span>' + (latestContact.status || '') + '</span>';
        html += '<span style="margin-left:auto;font-weight:500;">' + formatDate(latestContact.date) + '</span>';
        html += '</div>';
      } else {
        html += '<div style="display:flex;align-items:center;gap:8px;background:#f8fafc;border:1px dashed #cbd5e1;border-radius:8px;padding:8px 12px;font-size:12px;color:#94a3b8;">📞 暂无联系记录，点击添加</div>';
      }

      /* 服务记录摘要 */
      var allServiceRecords = [];
      item.matchedPolicies.forEach(function(p) {
        if (p.serviceRecords && p.serviceRecords.length > 0) {
          p.serviceRecords.forEach(function(sr) {
            allServiceRecords.push({
              date: sr.date,
              content: sr.content,
              policyName: p.insuranceName || '未命名保单'
            });
          });
        }
      });
      allServiceRecords.sort(function(a, b) { return (b.date || '').localeCompare(a.date || ''); });

      if (allServiceRecords.length > 0) {
        html += '<div style="margin-top:8px;border-top:1px solid #f1f5f9;padding-top:8px;">';
        html += '<div style="font-size:11px;font-weight:700;color:#64748b;margin-bottom:6px;">📋 服务记录 (' + allServiceRecords.length + ')</div>';
        html += '<div style="font-size:12px;max-height:100px;overflow-y:auto;border:1px solid #f1f5f9;border-radius:6px;padding:6px;">';
        var displayRecords = allServiceRecords.slice(0, 3);
        displayRecords.forEach(function(sr) {
          html += '<div style="margin-bottom:4px;padding-bottom:4px;border-bottom:1px dashed #f1f5f9;">';
          html += '<div style="font-weight:600;color:#334155;">' + (sr.policyName || '') + '</div>';
          html += '<div style="color:#94a3b8;font-size:11px;">' + formatDate(sr.date) + '</div>';
          html += '<div style="color:#475569;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + (sr.content || '') + '</div>';
          html += '</div>';
        });
        if (allServiceRecords.length > 3) {
          html += '<div style="text-align:center;color:#3b82f6;font-size:11px;cursor:pointer;padding:2px 0;" onclick="event.stopPropagation();selectClient(' + item.clientIdx + ')">查看全部 ' + allServiceRecords.length + ' 条记录 →</div>';
        }
        html += '</div></div>';
      }

      html += '</div>';
    });
  }
  document.getElementById('clientList').innerHTML = html;
}

/* 选择客户 - 跳转到详情页 */
function selectClient(idx) {
  selectedClientIdx = idx;
  document.getElementById('queryListView').style.display = 'none';
  document.getElementById('clientDetailView').style.display = 'block';
  renderDetailPanel(idx);
  showScriptToggleBtn();
  /* ★ 话术面板若已打开，切换到新客户的话术进度 */
  if (typeof ssOnClientChanged === 'function') ssOnClientChanged();
  window.scrollTo(0, 0);
}

/* 返回查询列表 */
function backToQueryList() {
  document.getElementById('queryListView').style.display = 'block';
  document.getElementById('clientDetailView').style.display = 'none';
  selectedClientIdx = -1;
  hideScriptToggleBtn();
  /* 如果话术面板打开着，关闭它 */
  if (ssPanelOpen) toggleScriptPanel();
  handleSearch();
  window.scrollTo(0, 0);
}

/* 滚动到保单详情锚点 */
function scrollToPolicyDetail(anchorId) {
  var el = document.getElementById(anchorId);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    /* 高亮闪烁 */
    el.style.transition = 'box-shadow 0.3s';
    el.style.boxShadow = '0 0 0 4px rgba(26,39,68,0.3)';
    setTimeout(function() { el.style.boxShadow = ''; }, 1500);
  }
}

/* 渲染详情面板 */
function renderDetailPanel(idx) {
  var panel = document.getElementById('detailPanel');
  var c = clientData[idx];
  if (!c) { panel.classList.remove('show'); return; }

  panel.classList.add('show');

  /* 返回按钮 */
  var html = '<button class="back-btn" onclick="backToQueryList()">&#8592; 返回查询列表</button>';

  /* 客户姓名单独显示 - 高亮卡片 + 年龄 */
  /* 计算周岁年龄 */
  var ageDisplay = '';
  if (c.idCard && c.idCard.length >= 14) {
    try {
      var by = parseInt(c.idCard.substring(6, 10));
      var bm = parseInt(c.idCard.substring(10, 12));
      var bd = parseInt(c.idCard.substring(12, 14));
      if (by > 1900 && by < 2100) {
        var now = new Date();
        var ageYears = now.getFullYear() - by;
        /* 检查是否已过生日 */
        var hasBirthdayThisYear = (now.getMonth() + 1 > bm) || (now.getMonth() + 1 === bm && now.getDate() >= bd);
        if (!hasBirthdayThisYear) ageYears--;
        ageDisplay = ' <span style="font-size:22px;font-weight:400;color:rgba(255,255,255,0.7);">' + ageYears + '岁</span>';
      }
    } catch(e) {}
  }
  html += '<div class="client-name-hero">' +
    '<h3>' + (c.name || '未命名') + ageDisplay + '</h3>' +
    '<div class="client-meta-info">' + (showSensitiveData ? (c.phone || '') : maskPhone(c.phone)) + (c.idCard ? ' | ' + (showSensitiveData ? c.idCard : maskIdCard(c.idCard)) : '') + '</div>' +
    '</div>';

  /* 不继续服务提示条 */
  if (c.doNotContact) {
    html += '<div style="background:#fef2f2;border:1.5px solid #fca5a5;border-radius:10px;padding:10px 16px;margin-bottom:14px;display:flex;align-items:center;gap:8px;">' +
      '<span style="font-size:18px;">🚫</span>' +
      '<span style="font-size:14px;font-weight:700;color:#991b1b;">此客户已标记为不继续服务，请勿再次打扰</span>' +
      '</div>';
  }

  /* 联系记录 - 紧凑模式，按条目自动拓宽 */
  var hasContacts = c.contactHistory && c.contactHistory.length > 0;
  html += '<div class="card" style="' + (hasContacts ? '' : 'padding:12px 16px;') + '">' +
    '<div class="card-title" style="' + (hasContacts ? '' : 'margin-bottom:0;padding-bottom:6px;border-bottom:none;') + '">联系记录' +
    '<button class="btn-sm btn-primary" onclick="openAddContactModal(' + idx + ')">添加联系记录</button></div>';
  if (hasContacts) {
    html += '<div class="timeline">';
    c.contactHistory.forEach(function(ch) {
      var cls = 'success';
      if (ch.status === '未联系上' || ch.status === '电话挂断') cls = 'danger';
      else if (ch.status === '已加微信') cls = 'warning';
      html += '<div class="timeline-item ' + cls + '">' +
        '<div class="timeline-date">' + formatDate(ch.date) + ' | <span class="tag tag-' +
        (ch.status === '已电话联系' || ch.status === '面见客户' ? 'green' : ch.status === '未联系上' || ch.status === '电话挂断' ? 'red' : 'yellow') +
        '">' + (ch.status || '') + '</span></div>' +
        '<div class="timeline-content">' + (ch.note || '') + '</div></div>';
    });
    html += '</div>';
  } else {
    html += '<div style="text-align:center;padding:8px 0;color:#94a3b8;font-size:13px;">暂无联系记录</div>';
  }
  html += '</div>';

  /* 信息完整性提醒 */
  var incomplete = getClientAllIncompleteFields(c);
  if (incomplete.clientMissing.length > 0 || incomplete.policyMissing.length > 0) {
    html += '<div style="background:#fef2f2;border:1.5px solid #fca5a5;border-radius:10px;padding:12px 16px;margin-bottom:14px;">' +
      '<div style="font-size:14px;font-weight:700;color:#991b1b;margin-bottom:6px;">⚠ 信息不完整提醒</div>';
    if (incomplete.clientMissing.length > 0) {
      html += '<div style="font-size:13px;color:#7f1d1d;margin-bottom:4px;"><strong>投保人缺失：</strong>' + incomplete.clientMissing.join('、') + '</div>';
    }
    if (incomplete.policyMissing.length > 0) {
      incomplete.policyMissing.forEach(function(pm) {
        html += '<div style="font-size:13px;color:#7f1d1d;margin-bottom:4px;"><strong>保单 ' + (pm.policyCode || '') + ' 缺失：</strong>' + pm.fields.join('、') + '</div>';
      });
    }
    html += '<div style="font-size:12px;color:#991b1b;margin-top:4px;">请点击编辑按钮补充完整信息</div></div>';
  }

  /* 客户基本信息 */
  html += '<div class="card">' +
    '<div class="card-title"><span>客户详情</span>' +
    '<div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center;">' +
    '<button class="btn-sm btn-outline no-print" onclick="editClient(' + idx + ')" style="padding:4px 10px;font-size:11px;min-height:30px;">编辑</button>' +
    '<button class="btn-sm no-print" onclick="printClientAllPolicies(' + idx + ')" style="padding:4px 10px;font-size:11px;min-height:30px;background:linear-gradient(135deg,#0f766e,#14b8a6);color:#fff;border:none;box-shadow:0 1px 4px rgba(20,184,166,.3);">🖨 打印全部(PDF)</button>' +
    '<button class="btn-sm btn-success no-print" onclick="exportClientToWord(' + idx + ')" style="padding:4px 10px;font-size:11px;min-height:30px;">导出Word</button>' +
    '<button class="btn-sm" onclick="deleteClient(' + idx + ')" style="padding:4px 10px;font-size:11px;min-height:30px;background:#fef2f2;color:#c41e3a;border:1px solid #fca5a5;">删除</button>' +
    (c.doNotContact
      ? '<button class="btn-sm" onclick="toggleDoNotContact(' + idx + ')" style="padding:4px 10px;font-size:11px;min-height:30px;background:#c41e3a;color:#fff;border:none;">取消停服</button>'
      : '<button class="btn-sm" onclick="toggleDoNotContact(' + idx + ')" style="padding:4px 10px;font-size:11px;min-height:30px;background:#fff7ed;color:#c2410c;border:1px solid #fdba74;">停服标记</button>') +
    '</div></div>' +
    '<div class="detail-section">' +
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px;font-size:13px;">' +
    '<p><strong>身份证：</strong>' + (showSensitiveData ? (c.idCard || '-') : maskIdCard(c.idCard)) + '</p>' +
    '<p><strong>手机号：</strong>' + (showSensitiveData ? (c.phone || '-') : maskPhone(c.phone)) + '</p>' +
    '<p><strong>地址：</strong>' + (c.address || '-') + '</p>' +
    '<p><strong>工作单位：</strong>' + (c.workCompany || '-') + '</p>' +
    '<p><strong>工作地址：</strong>' + (c.workAddress || '-') + '</p>' +
    '</div>';

  /* 家庭成员 */
  if (c.familyMembers && c.familyMembers.length > 0) {
    html += '<h4 style="margin-top:12px;border-bottom:1px solid #e2e8f0;padding-bottom:6px;">家庭成员</h4>';
    c.familyMembers.forEach(function(fm) {
      html += '<p style="font-size:13px;">' + (fm.name || '') + ' (' + (fm.relationship || '') + ')' +
        (fm.phone ? ' | ' + (showSensitiveData ? fm.phone : maskPhone(fm.phone)) : '') + (fm.note ? ' | ' + fm.note : '') + '</p>';
    });
  }
  html += '</div></div>';

  /* 客户画像（个人/家庭情况备注） */
  var _prof = c.profile;
  var _hasProfile = _prof && (_prof.personal || _prof.family);
  if (_hasProfile) {
    var _stale = profileStaleness(_prof.updatedAt);
    html += '<div class="card profile-card">' +
      '<div class="profile-card-head">' +
        '<div><div class="profile-card-title">客户画像</div>' +
        '<div class="profile-card-sub">持续了解客户，避免久不联系后遗忘或混淆</div></div>' +
        '<div class="profile-head-actions">' +
          '<span class="profile-badge ' + _stale.cls + '">' + (_stale.days === null ? '尚未记录更新时间' : '更新于 ' + daysFromToday(_prof.updatedAt)) + '</span>' +
          '<button class="btn-sm btn-warm no-print" onclick="openProfileModal(' + idx + ')">编辑画像</button>' +
        '</div>' +
      '</div>' +
      '<div class="profile-body">' +
      (_prof.personal ? '<div class="profile-chunk"><div class="profile-chunk-label">个人情况</div><div class="profile-chunk-text">' + htmlEscape(_prof.personal) + '</div></div>' : '') +
      (_prof.family ? '<div class="profile-chunk"><div class="profile-chunk-label">家庭情况</div><div class="profile-chunk-text">' + htmlEscape(_prof.family) + '</div></div>' : '') +
      '</div>' +
      '</div>';
  } else {
    html += '<div class="card profile-card profile-card-empty">' +
      '<div class="profile-empty-inner">' +
        '<div class="profile-empty-mark" aria-hidden="true"></div>' +
        '<div class="profile-empty-copy">' +
          '<div class="profile-card-title">客户画像</div>' +
          '<p class="profile-empty-text">尚未记录该客户的个人情况与家庭情况。每次接触后补全一点点，长期积累形成清晰印象。</p>' +
        '</div>' +
        '<button class="btn-sm btn-warm no-print" onclick="openProfileModal(' + idx + ')">建立画像</button>' +
      '</div>' +
      '</div>';
  }

  /* 保单列表 - 紧凑版，点击可展开详情 */
  html += '<div class="card"><div class="card-title">保单列表' +
    '<button class="btn-sm btn-primary" onclick="openAddPolicyModal(' + idx + ')">添加保单</button></div>';

  if (!c.policies || c.policies.length === 0) {
    html += '<div class="empty-state"><p>暂无保单</p></div>';
  } else {
    html += '<div class="table-responsive"><table class="policy-table" style="font-size:12px;">' +
      '<thead><tr><th class="col-name">险种</th><th class="col-type">类型</th><th class="col-status">状态</th><th class="col-insured">被保人</th></tr></thead><tbody>';
    c.policies.forEach(function(p, pIdx) {
      var statusClass = p.status === '有效' ? 'tag-green' : 'tag-red';
      var typeTag = p.mainType === '附加险' ? 'tag-yellow' : p.mainType === '万能险' ? 'tag-purple' : 'tag-blue';
      html += '<tr style="cursor:pointer;" onclick="scrollToPolicyDetail(\'policyDetail_' + pIdx + '\')" title="' + (p.insuranceName || '') + '">' +
        '<td class="col-name">' + (p.insuranceName || '') + '</td>' +
        '<td class="col-type"><span class="tag ' + typeTag + '" style="font-size:10px;padding:2px 4px;">' + (p.mainType || '主险') + '</span></td>' +
        '<td class="col-status"><span class="tag ' + statusClass + '" style="font-size:10px;padding:2px 4px;">' + (p.status || '有效') + '</span></td>' +
        '<td class="col-insured">' + (p.insured || c.name || '-') + '</td>' +
        '</tr>';
    });
    html += '</tbody></table></div>';
    html += '<div style="font-size:12px;color:#64748b;margin-top:6px;">点击表格行跳转到对应保单详情</div>';
  }
  html += '</div>';

  /* 保单详情 - 按主险/附加险/万能险分组显示 */
  if (c.policies && c.policies.length > 0) {
    html += '<div class="card"><div class="card-title">保单详情</div>';

    /* 分离主险、附加险、万能险 */
    var mainPolicies = [];
    var addonPolicies = [];
    var universalPolicies = [];
    var usedAddons = [];

    c.policies.forEach(function(p, pIdx) {
      p._idx = pIdx;
      var type = p.mainType || '主险';
      if (type === '附加险') addonPolicies.push(p);
      else if (type === '万能险') universalPolicies.push(p);
      else mainPolicies.push(p);
    });

    /* 渲染单个保单详情卡片 */
    function renderPolicyDetail(p) {
      var pIdx = p._idx;
      var detail = '';
      var isExpired = (p.status && p.status !== '有效');

      /* 被保人年龄计算 - 提前计算，供标题区使用 */
      var insuredId = p.insuredId || c.idCard || '';
      var currentAge = calcAgeFromIdCard(insuredId, null);
      var effAge = calcAgeFromIdCard(insuredId, p.effectiveDate);

      /* 保单标题与操作 */
      var typeLabel = p.mainType === '附加险' ? '附加险' : p.mainType === '万能险' ? '万能险' : '主险';
      detail += '<div id="policyDetail_' + pIdx + '" class="policy-detail-card' + (isExpired ? ' policy-expired' : '') + '">';
      detail += '<div class="policy-detail-header' + (isExpired ? ' header-expired' : '') + '">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:4px;">' +
        '<div style="flex:1;min-width:0;">' +
        '<div class="pdh-name' + (isExpired ? ' pdh-name-expired' : '') + '">' + (p.insuranceName || '') + '</div>' +
        '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:2px;">' +
        '<span class="pdh-code" title="' + (p.policyCode || '') + '">' + (p.policyCode || '-') + '</span>' +
        (p.codeType ? '<span style="color:rgba(255,255,255,0.5);font-size:13px;font-weight:500;">' + p.codeType + '</span>' : '') +
        '</div></div>' +
        '<div style="display:flex;gap:4px;align-items:center;flex-shrink:0;">' +
        '<span class="tag ' + (typeLabel === '附加险' ? 'tag-yellow' : typeLabel === '万能险' ? 'tag-purple' : 'tag-blue') + '" style="font-size:10px;padding:2px 6px;">' + typeLabel + '</span>' +
        '<span class="tag ' + (p.status === '有效' ? 'tag-green' : 'tag-red') + '" style="font-size:10px;padding:2px 6px;">' + (p.status || '有效') + '</span>' +
        (p.hasDividend ? '<span class="tag tag-purple" style="background:#fef3c7;color:#92400e;font-size:10px;padding:2px 6px;">分红</span>' : '') +
        '<button class="btn-sm btn-outline no-print" onclick="printSinglePolicy(' + idx + ',' + pIdx + ')" style="padding:4px 10px;font-size:11px;min-height:28px;border-color:rgba(255,255,255,0.5);color:#fff;">🖨 打印</button>' +
        '<button class="btn-sm btn-outline no-print" onclick="editPolicy(' + idx + ',' + pIdx + ')">编辑</button>' +
        '<button class="btn-sm btn-danger no-print" onclick="deletePolicy(' + idx + ',' + pIdx + ')">删除</button>' +
        '</div></div>' +
        '<div class="policy-meta">' +
        (isExpired
          ? '<span style="background:rgba(239,68,68,0.25);color:#fca5a5;padding:2px 10px;border-radius:10px;font-size:14px;font-weight:700;">失效：' + (p.expiryDate ? formatDate(p.expiryDate) : (p.maturityDate ? formatDate(p.maturityDate) : '未知')) + '</span>'
          : '<span style="background:rgba(34,197,94,0.2);color:#4ade80;padding:2px 10px;border-radius:10px;font-size:14px;font-weight:700;">生效：' + formatDate(p.effectiveDate) + (effAge !== null ? '（' + effAge + '岁）' : '') + '</span>') +
        (p.maturityDate && !isExpired ? '<span style="background:rgba(251,191,36,0.2);color:#fbbf24;padding:2px 10px;border-radius:10px;font-size:14px;font-weight:700;">满期：' + formatDate(p.maturityDate) + '</span>' : '') +
        '</div>' +
        '</div>';

      detail += '<div class="policy-detail-body">';

      /* 险种赔付/领取特征（来自险种库档案） */
      var _libItem = findLibItem(p.insuranceName, p.codeType);
      if (_libItem && _libItem.traits && hasTraitContent(_libItem.traits)) {
        detail += '<div class="policy-trait-strip">' + traitCatTag(_libItem) + traitChipsHtml(_libItem) + '</div>';
      }

      /* 被保人信息 - 加大字体 */
      detail += '<div class="info-block insured-block">' +
        '<h6>被保人信息</h6>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;font-size:16px;color:#0f172a;font-weight:500;">' +
        '<p><strong>姓名：</strong>' + (p.insured || c.name || '-') + '</p>' +
        '<p><strong>关系：</strong>' + (p.insuredRelation || '-') + '</p>' +
        '<p><strong>身份证号：</strong>' + (showSensitiveData ? (insuredId || '-') : maskIdCard(insuredId)) + '</p>' +
        '<p><strong>今年岁数：</strong>' + (currentAge !== null ? '<span style="color:#1d4ed8;font-weight:800;font-size:18px;">' + currentAge + '</span> 岁' : '-') + '</p>' +
        '<p><strong>联系方式：</strong>' + (showSensitiveData ? (p.insuredPhone || c.phone || '-') : maskPhone(p.insuredPhone || c.phone)) + '</p>' +
        '<p><strong>联系地址：</strong>' + (p.insuredAddress || c.address || '-') + '</p>' +
        '</div></div>';

      /* 金额与缴费信息 - 深色系 */
      detail += '<div class="info-block amount-block">' +
        '<h6>金额信息</h6>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;font-size:13px;">' +
        '<div class="amount-item"><div class="amount-label">年缴保费</div><div class="amount-value">' + formatMoney(p.annualPremium) + '</div></div>' +
        '<div class="amount-item sum-insured-item"><div class="amount-label">保额</div><div class="amount-value">' + formatMoney(p.sumInsured) + '</div></div>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:6px;font-size:13px;margin-top:10px;color:#0f172a;">' +
        '<p><strong>缴费方式：</strong>' + (p.paymentMethod || '-') + '</p>' +
        '<p><strong>缴费期限：</strong>' + (p.paymentTerm || '-') + ' 年</p>' +
        (p.parentPolicyCode ? '<p><strong>关联主险：</strong>' + p.parentPolicyCode + '</p>' : '') +
        '</div>' +
        /* 缴费银行：仅当缴费期内显示 */
        (function() {
          if (!p.paymentBank || !p.paymentBankCard) return '';
          var effDate = p.effectiveDate;
          var term = parseInt(p.paymentTerm);
          if (!effDate || !term || isNaN(term)) return '';
          /* 计算缴费到期日: 生效日 + 缴费年限 */
          var y = parseInt(effDate.substring(0,4));
          var md = effDate.substring(4,8);
          var endYear = y + term;
          var endDateStr = endYear + md;
          var today = new Date();
          var todayStr = today.getFullYear() + String(today.getMonth()+1).padStart(2,'0') + String(today.getDate()).padStart(2,'0');
          if (todayStr > endDateStr) return ''; /* 已缴满，不显示 */
          return '<div style="background:#eff6ff;border:1.5px solid #3b82f6;border-radius:8px;padding:10px 14px;margin-top:8px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">' +
            '<span style="font-size:12px;color:#1e40af;font-weight:600;">缴费银行</span>' +
            '<span style="font-size:15px;font-weight:800;color:#0f172a;">' + p.paymentBank + '</span>' +
            '<span style="font-size:12px;color:#64748b;">尾号</span>' +
            '<span style="font-size:17px;font-weight:900;color:#1d4ed8;letter-spacing:2px;">' + p.paymentBankCard + '</span>' +
            '</div>';
        })() +
        '</div></div>';

      /* 生存金信息 */
      if (p.survivalBenefit && p.survivalBenefit.type) {
        var sb = p.survivalBenefit;
        var typeLabel = sb.type === 'annual' ? '每年领取' : sb.type === 'triennial' ? '每3年领取' : '到期领取';
        /* 计算距离下次领取还有多少天 */
        var daysUntilNext = '';
        var alertClass = '';
        if (sb.nextDate) {
          var nextDateObj = new Date(sb.nextDate.substring(0, 4) + '-' + sb.nextDate.substring(4, 6) + '-' + sb.nextDate.substring(6, 8));
          var today = new Date();
          today.setHours(0,0,0,0);
          var diffDays = Math.ceil((nextDateObj - today) / 86400000);
          if (diffDays <= 30 && diffDays >= 0) {
            alertClass = ' style="border-color:#ef4444 !important;background:#fef2f2 !important;"';
            daysUntilNext = '<span style="color:#dc2626;font-weight:800;font-size:14px;">⚠ 仅剩 ' + diffDays + ' 天</span>';
          } else if (diffDays < 0) {
            daysUntilNext = '<span style="color:#dc2626;font-weight:700;">已过期 ' + Math.abs(diffDays) + ' 天</span>';
          } else {
            daysUntilNext = '<span style="color:#475569;">还有 ' + diffDays + ' 天</span>';
          }
        }
        detail += '<div style="' + (isExpired
          ? 'background:#f4f4f5;border:2px dashed #9ca3af;border-radius:10px;padding:16px;margin-bottom:10px;'
          : 'background:#f0fdf4;border:2px solid #22c55e;border-radius:10px;padding:16px;margin-bottom:10px;') + '">' +
          '<h6 style="font-size:14px;' + (isExpired ? 'color:#6b7280;' : 'color:#166534;') + 'margin-bottom:12px;border-bottom:2px solid ' + (isExpired ? '#d1d5db' : '#86efac') + ';padding-bottom:8px;font-weight:700;">生存金信息' + (isExpired ? '（已失效）' : '') + '</h6>' +
          '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;font-size:13px;">' +
          '<div style="text-align:center;padding:10px;background:#ffffff;border:1.5px solid ' + (isExpired ? '#d1d5db' : '#86efac') + ';border-radius:8px;"><div style="font-size:12px;' + (isExpired ? 'color:#6b7280;' : 'color:#166534;') + 'margin-bottom:4px;font-weight:700;">领取方式</div><div style="font-size:18px;font-weight:800;' + (isExpired ? 'color:#6b7280;' : 'color:#166534;') + '">' + typeLabel + '</div></div>' +
          '<div style="text-align:center;padding:10px;background:#ffffff;border:1.5px solid ' + (isExpired ? '#d1d5db' : '#fbbf24') + ';border-radius:8px;"><div style="font-size:12px;' + (isExpired ? 'color:#6b7280;' : 'color:#92400e;') + 'margin-bottom:4px;font-weight:700;">生存金金额</div><div style="font-size:22px;font-weight:900;' + (isExpired ? 'color:#9ca3af;' : 'color:#b45309;') + '">' + formatMoney(sb.amount) + ' 元</div></div>' +
          '</div>' +
          '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:6px;font-size:14px;margin-top:12px;' + (isExpired ? 'color:#9ca3af;' : 'color:#0f172a;') + '">' +
          (sb.startDate ? '<p><strong>起领日期：</strong>' + formatDate(sb.startDate) + '</p>' : '') +
          '<p><strong>最近领取：</strong>' + formatDate(sb.lastDate) + '</p>' +
          '<p' + alertClass + '><strong>下次领取：</strong>' + formatDate(sb.nextDate) + ' ' + daysUntilNext + '</p>' +
          (sb.note ? '<p><strong>备注：</strong>' + sb.note + '</p>' : '') +
          '</div></div>';
      }

      /* 受益人 */
      if (p.beneficiaries && p.beneficiaries.length > 0) {
        detail += '<div style="margin-bottom:10px;"><h6 style="font-size:13px;color:#1e293b;margin-bottom:6px;font-weight:700;">受益人</h6>';
        p.beneficiaries.forEach(function(b) {
          detail += '<span style="display:inline-block;background:#f1f5f9;padding:4px 12px;border-radius:6px;font-size:12px;margin-right:6px;margin-bottom:4px;color:#1e293b;">' +
            (b.name || '') + ' - ' + (b.quota || '') + '%</span>';
        });
        detail += '</div>';
      }

      /* 备注 */
      if (p.remark) {
        detail += '<div style="background:#fff7ed;border:1px solid #fdba74;border-radius:6px;padding:8px 12px;margin-bottom:10px;font-size:13px;color:#1e293b;">' +
          '<strong>备注：</strong>' + p.remark + '</div>';
      }

      /* 服务记录 */
      detail += '<div style="margin-top:8px;">' +
        '<h6 style="font-size:13px;color:#1e293b;margin-bottom:6px;font-weight:700;">服务记录</h6>';
      if (p.serviceRecords && p.serviceRecords.length > 0) {
        detail += '<div class="timeline">';
        p.serviceRecords.forEach(function(sr) {
          detail += '<div class="timeline-item">' +
            '<div class="timeline-date">' + formatDate(sr.date) + '</div>' +
            '<div class="timeline-content">' + (sr.content || '') + '</div></div>';
        });
        detail += '</div>';
      } else {
        detail += '<p style="font-size:12px;color:#6b7280;">暂无服务记录</p>';
      }
      detail += '<button class="btn-sm btn-outline" style="margin-top:8px;" onclick="openAddServiceModal(' + idx + ',' + pIdx + ')">添加服务记录</button>';
      detail += '</div>';

      detail += '</div>'; /* policy-detail-body */
      detail += '</div>'; /* policy-detail-card */
      return detail;
    }

    /* 渲染主险及其附加险/万能险分组 */
    mainPolicies.forEach(function(mp) {
      html += '<div class="policy-group">';
      html += '<div class="policy-group-main">▸ 主险</div>';
      html += renderPolicyDetail(mp);

      /* 查找关联的附加险 */
      var associatedAddons = addonPolicies.filter(function(ap) {
        return ap.parentPolicyCode && ap.parentPolicyCode === mp.policyCode;
      });
      associatedAddons.forEach(function(ap) {
        usedAddons.push(ap);
        html += '<div class="policy-group-addon">▸ 附加险</div>';
        html += renderPolicyDetail(ap);
      });

      /* 查找关联的万能险 */
      var associatedUniversal = universalPolicies.filter(function(up) {
        return up.parentPolicyCode && up.parentPolicyCode === mp.policyCode;
      });
      associatedUniversal.forEach(function(up) {
        usedAddons.push(up);
        html += '<div class="policy-group-universal">▸ 万能险</div>';
        html += renderPolicyDetail(up);
      });

      html += '</div>';
    });

    /* 未关联的附加险 */
    var unlinkedAddons = addonPolicies.filter(function(ap) { return usedAddons.indexOf(ap) === -1; });
    unlinkedAddons.forEach(function(ap) {
      html += '<div class="policy-group">';
      html += '<div class="policy-group-addon">▸ 附加险（未关联）</div>';
      html += renderPolicyDetail(ap);
      html += '</div>';
    });

    /* 未关联的万能险 */
    var unlinkedUniversal = universalPolicies.filter(function(up) { return usedAddons.indexOf(up) === -1; });
    unlinkedUniversal.forEach(function(up) {
      html += '<div class="policy-group">';
      html += '<div class="policy-group-universal">▸ 万能险（未关联）</div>';
      html += renderPolicyDetail(up);
      html += '</div>';
    });

    html += '</div>';
  }

  panel.innerHTML = html;
}

