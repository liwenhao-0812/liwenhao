/* ======== 客户增删改 ======== */

/* 打开添加客户模态框 */
function openAddClientModal() {
  document.getElementById('clientModalTitle').textContent = '添加客户';
  document.getElementById('clientEditIndex').value = -1;
  document.getElementById('clientName').value = '';
  document.getElementById('clientIdCard').value = '';
  document.getElementById('clientPhone').value = '';
  document.getElementById('clientAddress').value = '';
  document.getElementById('clientWorkCompany').value = '';
  document.getElementById('clientWorkAddress').value = '';
  document.getElementById('familyMembersList').innerHTML = '';
  openModal('clientModal');
}

/* 编辑客户 */
function editClient(idx) {
  var c = clientData[idx];
  document.getElementById('clientModalTitle').textContent = '编辑客户';
  document.getElementById('clientEditIndex').value = idx;
  document.getElementById('clientName').value = c.name || '';
  document.getElementById('clientIdCard').value = c.idCard || '';
  document.getElementById('clientPhone').value = c.phone || '';
  document.getElementById('clientAddress').value = c.address || '';
  document.getElementById('clientWorkCompany').value = c.workCompany || '';
  document.getElementById('clientWorkAddress').value = c.workAddress || '';
  /* 家庭成员 */
  var fmHtml = '';
  (c.familyMembers || []).forEach(function(fm) {
    fmHtml += buildFamilyMemberField(fm);
  });
  document.getElementById('familyMembersList').innerHTML = fmHtml;
  openModal('clientModal');
}

/* 构建家庭成员字段HTML */
function buildFamilyMemberField(data) {
  return '<div style="display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:6px;margin-bottom:6px;align-items:end;">' +
    '<div><label style="font-size:11px;">姓名</label><input type="text" class="fm-name" value="' + (data.name || '') + '" placeholder="姓名"></div>' +
    '<div><label style="font-size:11px;">关系</label><input type="text" class="fm-rel" value="' + (data.relationship || '') + '" placeholder="如：配偶"></div>' +
    '<div><label style="font-size:11px;">身份证</label><input type="text" class="fm-id" value="' + (data.idCard || '') + '" placeholder="身份证号"></div>' +
    '<div><label style="font-size:11px;">电话</label><input type="text" class="fm-phone" value="' + (data.phone || '') + '" placeholder="手机号"></div>' +
    '<div><label style="font-size:11px;">备注</label><input type="text" class="fm-note" value="' + (data.note || '') + '" placeholder="备注"></div>' +
    '<div><button type="button" class="btn-sm btn-danger" onclick="this.parentElement.remove()">删除</button></div>' +
    '</div>';
}

/* 添加家庭成员字段 */
function addFamilyMemberField() {
  var container = document.getElementById('familyMembersList');
  var div = document.createElement('div');
  div.innerHTML = buildFamilyMemberField({});
  container.appendChild(div.firstElementChild);
}

/* 保存客户 */
function saveClient() {
  var name = document.getElementById('clientName').value.trim();
  if (!name) { showToast('请输入投保人姓名', 'warning'); return; }

  /* 收集家庭成员 */
  var familyMembers = [];
  var fmContainers = document.getElementById('familyMembersList').children;
  for (var i = 0; i < fmContainers.length; i++) {
    var fmName = fmContainers[i].querySelector('.fm-name').value.trim();
    if (fmName) {
      familyMembers.push({
        name: fmName,
        relationship: fmContainers[i].querySelector('.fm-rel').value.trim(),
        idCard: fmContainers[i].querySelector('.fm-id').value.trim(),
        phone: fmContainers[i].querySelector('.fm-phone').value.trim(),
        note: fmContainers[i].querySelector('.fm-note').value.trim()
      });
    }
  }

  var clientObj = {
    name: name,
    idCard: document.getElementById('clientIdCard').value.trim(),
    phone: document.getElementById('clientPhone').value.trim(),
    address: document.getElementById('clientAddress').value.trim(),
    workCompany: document.getElementById('clientWorkCompany').value.trim(),
    workAddress: document.getElementById('clientWorkAddress').value.trim(),
    policies: [],
    familyMembers: familyMembers,
    contactHistory: []
  };

  var editIdx = parseInt(document.getElementById('clientEditIndex').value);
  if (editIdx >= 0) {
    /* 编辑：保留原有保单、联系记录、画像及状态标记 */
    clientObj.policies = clientData[editIdx].policies || [];
    clientObj.contactHistory = clientData[editIdx].contactHistory || [];
    clientObj.profile = clientData[editIdx].profile || null;
    clientObj.doNotContact = clientData[editIdx].doNotContact || false;
    clientData[editIdx] = clientObj;
    showToast('客户信息已更新', 'success');
  } else {
    clientObj.profile = null;
    clientObj.doNotContact = false;
    clientData.push(clientObj);
    showToast('客户添加成功', 'success');
  }

  savePolicyData();
  closeModal('clientModal');
  refreshCurrentTab();
  if (editIdx >= 0 && selectedClientIdx === editIdx && currentTab === 'query' && document.getElementById('clientDetailView').style.display !== 'none') {
    renderDetailPanel(editIdx);
  }
}

/* 删除客户 */
function deleteClient(idx) {
  showConfirm('确定要删除客户 "' + (clientData[idx].name || '') + '" 及其所有保单吗？此操作不可撤销。', function() {
    clientData.splice(idx, 1);
    savePolicyData();
    backToQueryList();
    showToast('客户已删除', 'success');
  });
}

/* ======== 客户画像 ======== */

/* 打开画像编辑模态框 */
function openProfileModal(clientIdx) {
  document.getElementById('profileClientIndex').value = clientIdx;
  var c = clientData[clientIdx];
  var profile = (c && c.profile) ? c.profile : null;
  document.getElementById('profilePersonal').value = (profile && profile.personal) ? profile.personal : '';
  document.getElementById('profileFamily').value = (profile && profile.family) ? profile.family : '';
  /* 更新时间 */
  if (profile && profile.updatedAt) {
    document.getElementById('profileUpdatedAt').textContent = '上次更新：' + formatDate(profile.updatedAt) + '（' + daysFromToday(profile.updatedAt) + '）';
  } else {
    document.getElementById('profileUpdatedAt').textContent = '尚未建立画像';
  }
  openModal('profileModal');
}

/* 保存客户画像 */
function saveProfile() {
  var idx = parseInt(document.getElementById('profileClientIndex').value);
  if (isNaN(idx) || idx < 0 || idx >= clientData.length) { showToast('客户信息异常', 'warning'); return; }
  var personal = document.getElementById('profilePersonal').value.trim();
  var family = document.getElementById('profileFamily').value.trim();
  if (!personal && !family) {
    showToast('请至少填写一项画像内容', 'warning');
    return;
  }
  clientData[idx].profile = {
    personal: personal,
    family: family,
    updatedAt: todayStamp()
  };
  savePolicyData();
  closeModal('profileModal');
  if (currentTab === 'query' && document.getElementById('clientDetailView').style.display !== 'none') {
    renderDetailPanel(idx);
  }
  showToast('客户画像已保存', 'success');
}

/* 是否画像缺失（用于提醒） */
function isProfileIncomplete(c) {
  return !(c && c.profile && (c.profile.personal || c.profile.family));
}

/* 画像新鲜度：返回距今天数与样式类（fresh/aging/stale） */
function profileStaleness(updatedAt) {
  var s = toYMD(updatedAt);
  if (!s || !/^\d{8}$/.test(s)) return { days: null, cls: 'stale' };
  var d = new Date(s.substring(0, 4) + '-' + s.substring(4, 6) + '-' + s.substring(6, 8));
  var today = new Date(todayStamp().substring(0, 4) + '-' + todayStamp().substring(4, 6) + '-' + todayStamp().substring(6, 8));
  var diff = Math.round((today - d) / 86400000);
  var cls = diff <= 30 ? 'fresh' : (diff <= 90 ? 'aging' : 'stale');
  return { days: diff, cls: cls };
}

/* ======== 保单增删改 ======== */

/* 打开添加保单模态框 */
function openAddPolicyModal(clientIdx) {
  document.getElementById('policyModalTitle').textContent = '添加保单';
  document.getElementById('policyClientIndex').value = clientIdx;
  document.getElementById('policyEditIndex').value = -1;
  clearPolicyForm();
  /* 填充关联主险下拉 */
  populateParentPolicyDropdown(clientIdx, '');
  /* 默认填入投保人信息作为被保人（本人） */
  document.getElementById('insuredName').value = clientData[clientIdx].name || '';
  document.getElementById('insuredRelation').value = '本人';
  document.getElementById('insuredId').value = clientData[clientIdx].idCard || '';
  document.getElementById('insuredPhone').value = clientData[clientIdx].phone || '';
  document.getElementById('insuredAddress').value = clientData[clientIdx].address || '';
  openModal('policyModal');
}

/* 填充关联主险保单下拉 */
function populateParentPolicyDropdown(clientIdx, selectedCode) {
  var select = document.getElementById('parentPolicyCode');
  select.innerHTML = '<option value="">不关联（独立保单）</option>';
  var c = clientData[clientIdx];
  if (!c || !c.policies) return;
  c.policies.forEach(function(p) {
    if (p.mainType === '主险' || (!p.mainType)) {
      var opt = document.createElement('option');
      opt.value = p.policyCode;
      opt.textContent = p.policyCode + ' - ' + (p.insuranceName || '');
      if (p.policyCode === selectedCode) opt.selected = true;
      select.appendChild(opt);
    }
  });
}

/* 自动填充被保人关系 */
function autoFillInsuredRelation() {
  var insuredName = document.getElementById('insuredName').value.trim();
  var clientIdx = parseInt(document.getElementById('policyClientIndex').value);
  if (clientIdx >= 0 && clientData[clientIdx]) {
    var clientName = clientData[clientIdx].name || '';
    if (insuredName === clientName) {
      document.getElementById('insuredRelation').value = '本人';
    }
  }
}

/* 被保人关系变更时自动添加家庭成员 */
function onInsuredRelationChange() {
  var relation = document.getElementById('insuredRelation').value;
  if (!relation || relation === '本人') return;
  
  var insuredName = document.getElementById('insuredName').value.trim();
  var insuredId = document.getElementById('insuredId').value.trim();
  var insuredPhone = document.getElementById('insuredPhone').value.trim();
  var insuredAddress = document.getElementById('insuredAddress').value.trim();
  
  if (!insuredName) return;
  
  /* 检查是否已存在 */
  var familyList = document.getElementById('familyMembersList');
  var existing = familyList.querySelectorAll('.fm-name');
  for (var i = 0; i < existing.length; i++) {
    if (existing[i].value.trim() === insuredName) return;
  }
  
  /* 计算年龄 */
  var age = '';
  if (insuredId.length >= 14) {
    try {
      var by = parseInt(insuredId.substring(6, 10));
      if (by > 1900 && by < 2100) {
        age = (new Date().getFullYear() - by);
      }
    } catch(e) {}
  }
  
  /* 添加家庭成员 */
  var container = document.getElementById('familyMembersList');
  var div = document.createElement('div');
  div.innerHTML = buildFamilyMemberField({
    name: insuredName,
    relationship: relation,
    idCard: insuredId,
    phone: insuredPhone,
    note: (age ? '年龄' + age + '岁' : '') + (insuredAddress ? ' | ' + insuredAddress : '')
  });
  container.appendChild(div.firstElementChild);
}

/* 编辑保单 */
function editPolicy(clientIdx, policyIdx) {
  var p = clientData[clientIdx].policies[policyIdx];
  document.getElementById('policyModalTitle').textContent = '编辑保单';
  document.getElementById('policyClientIndex').value = clientIdx;
  document.getElementById('policyEditIndex').value = policyIdx;
  document.getElementById('policyCode').value = p.policyCode || '';
  document.getElementById('insuranceName').value = p.insuranceName || '';
  document.getElementById('codeType').value = p.codeType || '';
  document.getElementById('mainType').value = p.mainType || '主险';
  /* 填充关联保单下拉 */
  populateParentPolicyDropdown(clientIdx, p.parentPolicyCode || '');
  document.getElementById('policyStatus').value = p.status || '有效';
  document.getElementById('hasDividend').checked = p.hasDividend || false;
  document.getElementById('effectiveDate').value = formatDate(p.effectiveDate);
  document.getElementById('maturityDate').value = formatDate(p.maturityDate);
  document.getElementById('paymentMethod').value = p.paymentMethod || '年缴';
  document.getElementById('annualPremium').value = p.annualPremium || '';
  document.getElementById('sumInsured').value = p.sumInsured || '';
  document.getElementById('paymentTerm').value = p.paymentTerm || '';
  document.getElementById('paymentBank').value = p.paymentBank || '';
  document.getElementById('paymentBankCard').value = p.paymentBankCard || '';
  document.getElementById('insuredName').value = p.insured || '';
  document.getElementById('insuredRelation').value = p.insuredRelation || '';
  /* 被保人身份证/手机/地址：优先保单级，为空则回退客户端级 */
  document.getElementById('insuredId').value = p.insuredId || clientData[clientIdx].idCard || '';
  document.getElementById('insuredPhone').value = p.insuredPhone || clientData[clientIdx].phone || '';
  document.getElementById('insuredAddress').value = p.insuredAddress || clientData[clientIdx].address || '';
  document.getElementById('policyRemark').value = p.remark || '';

  /* 生存金 */
  if (p.survivalBenefit) {
    document.getElementById('survivalBenefitType').value = p.survivalBenefit.type || '';
    document.getElementById('survivalBenefitAmount').value = p.survivalBenefit.amount || '';
    document.getElementById('survivalStartDate').value = formatDate(p.survivalBenefit.startDate);
    document.getElementById('survivalLastDate').value = formatDate(p.survivalBenefit.lastDate);
    document.getElementById('survivalNextDate').value = formatDate(p.survivalBenefit.nextDate);
    document.getElementById('survivalBenefitNote').value = p.survivalBenefit.note || '';
  } else {
    document.getElementById('survivalBenefitType').value = '';
    document.getElementById('survivalBenefitAmount').value = '';
    document.getElementById('survivalStartDate').value = '';
    document.getElementById('survivalLastDate').value = '';
    document.getElementById('survivalNextDate').value = '';
    document.getElementById('survivalBenefitNote').value = '';
  }

  /* 受益人 */
  var bHtml = '';
  (p.beneficiaries || []).forEach(function(b) {
    bHtml += buildBeneficiaryField(b);
  });
  document.getElementById('beneficiariesList').innerHTML = bHtml;
  /* 显示险种库中该险种的赔付/领取特征 */
  showPolicyTraitHint(findLibItem(p.insuranceName, p.codeType));
  openModal('policyModal');
}

/* 清空保单表单 */
function clearPolicyForm() {
  showPolicyTraitHint(null);
  ['policyCode','insuranceName','codeType','annualPremium',
   'sumInsured','paymentTerm','paymentBank','paymentBankCard','insuredName','insuredId',
   'insuredPhone','insuredAddress','policyRemark','survivalBenefitAmount','survivalLastDate',
   'survivalNextDate','survivalBenefitNote','survivalStartDate'].forEach(function(id) { document.getElementById(id).value = ''; });
  document.getElementById('mainType').value = '主险';
  document.getElementById('policyStatus').value = '有效';
  document.getElementById('paymentMethod').value = '年缴';
  document.getElementById('effectiveDate').value = '';
  document.getElementById('maturityDate').value = '';
  document.getElementById('survivalBenefitType').value = '';
  document.getElementById('beneficiariesList').innerHTML = '';
  document.getElementById('insuredRelation').value = '';
  document.getElementById('hasDividend').checked = false;
  /* 清空关联保单下拉 */
  document.getElementById('parentPolicyCode').innerHTML = '<option value="">不关联（独立保单）</option>';
}

/* 构建受益人字段 */
function buildBeneficiaryField(data) {
  return '<div style="display:flex;gap:6px;margin-bottom:6px;align-items:end;">' +
    '<div style="flex:1;"><label style="font-size:11px;">姓名</label><input type="text" class="ben-name" value="' + (data.name || '') + '" placeholder="姓名"></div>' +
    '<div style="flex:1;"><label style="font-size:11px;">比例</label><input type="text" class="ben-quota" value="' + (data.quota || '') + '" placeholder="如：100%"></div>' +
    '<div><button type="button" class="btn-sm btn-danger" onclick="this.parentElement.remove()">删除</button></div></div>';
}

/* 添加受益人字段 */
function addBeneficiaryField() {
  var container = document.getElementById('beneficiariesList');
  var div = document.createElement('div');
  div.innerHTML = buildBeneficiaryField({});
  container.appendChild(div.firstElementChild);
}

/* 保存保单 */
function savePolicy() {
  var policyCode = document.getElementById('policyCode').value.trim();
  var insuranceName = document.getElementById('insuranceName').value.trim();
  if (!policyCode || !insuranceName) {
    showToast('请填写保单代码和险种名称', 'warning');
    return;
  }

  /* 自动收录险种到险种库 */
  var codeType = document.getElementById('codeType').value.trim();
  if (insuranceName && codeType) {
    addToInsuranceTypeLib(insuranceName, codeType);
  }

  /* 收集受益人 */
  var beneficiaries = [];
  var benContainers = document.getElementById('beneficiariesList').children;
  for (var i = 0; i < benContainers.length; i++) {
    var benName = benContainers[i].querySelector('.ben-name').value.trim();
    if (benName) {
      beneficiaries.push({
        name: benName,
        quota: benContainers[i].querySelector('.ben-quota').value.trim()
      });
    }
  }

  var clientIdx = parseInt(document.getElementById('policyClientIndex').value);
  var c = clientData[clientIdx];
  var insuredName = document.getElementById('insuredName').value.trim() || c.name;
  var insuredRelation = document.getElementById('insuredRelation').value;
  /* 被保人为本人时，空字段自动从客户信息回填，确保数据一致 */
  var isSelf = (insuredRelation === '本人') || (!insuredRelation && insuredName === (c.name || ''));
  var insuredId = document.getElementById('insuredId').value.trim();
  var insuredPhone = document.getElementById('insuredPhone').value.trim();
  var insuredAddress = document.getElementById('insuredAddress').value.trim();
  if (isSelf) {
    if (!insuredId) insuredId = c.idCard || '';
    if (!insuredPhone) insuredPhone = c.phone || '';
    if (!insuredAddress) insuredAddress = c.address || '';
  }

  var policyObj = {
    policyCode: policyCode,
    insuranceName: insuranceName,
    codeType: codeType,
    mainType: document.getElementById('mainType').value,
    parentPolicyCode: document.getElementById('parentPolicyCode').value,
    status: document.getElementById('policyStatus').value,
    hasDividend: document.getElementById('hasDividend').checked,
    effectiveDate: toYMD(document.getElementById('effectiveDate').value),
    maturityDate: toYMD(document.getElementById('maturityDate').value),
    paymentMethod: document.getElementById('paymentMethod').value,
    annualPremium: document.getElementById('annualPremium').value,
    sumInsured: document.getElementById('sumInsured').value,
    paymentTerm: document.getElementById('paymentTerm').value,
    paymentBank: document.getElementById('paymentBank').value.trim(),
    paymentBankCard: document.getElementById('paymentBankCard').value.trim(),
    insured: insuredName,
    insuredRelation: insuredRelation,
    insuredId: insuredId,
    insuredPhone: insuredPhone,
    insuredAddress: insuredAddress,
    beneficiaries: beneficiaries,
    remark: document.getElementById('policyRemark').value.trim(),
    survivalBenefit: {
      type: document.getElementById('survivalBenefitType').value,
      amount: document.getElementById('survivalBenefitAmount').value,
      startDate: toYMD(document.getElementById('survivalStartDate').value),
      lastDate: toYMD(document.getElementById('survivalLastDate').value),
      nextDate: toYMD(document.getElementById('survivalNextDate').value),
      note: document.getElementById('survivalBenefitNote').value.trim()
    },
    extraFields: {},
    serviceRecords: []
  };

  var editIdx = parseInt(document.getElementById('policyEditIndex').value);

  if (editIdx >= 0) {
    /* 编辑保单：保留服务记录 */
    policyObj.serviceRecords = clientData[clientIdx].policies[editIdx].serviceRecords || [];
    clientData[clientIdx].policies[editIdx] = policyObj;
    showToast('保单已更新', 'success');
  } else {
    if (!clientData[clientIdx].policies) clientData[clientIdx].policies = [];
    clientData[clientIdx].policies.push(policyObj);
    showToast('保单添加成功', 'success');
  }

  savePolicyData();
  updateInsuranceTypeDatalist();
  closeModal('policyModal');
  refreshCurrentTab();
  if (selectedClientIdx === clientIdx && currentTab === 'query' && document.getElementById('clientDetailView').style.display !== 'none') {
    renderDetailPanel(clientIdx);
  }
}

/* 删除保单 */
function deletePolicy(clientIdx, policyIdx) {
  var p = clientData[clientIdx].policies[policyIdx];
  showConfirm('确定要删除保单 "' + (p.policyCode || '') + '" 吗？', function() {
    var deletedCode = p.policyCode;
    clientData[clientIdx].policies.splice(policyIdx, 1);
    savePolicyData();
    refreshCurrentTab();
    if (selectedClientIdx === clientIdx && currentTab === 'query' && document.getElementById('clientDetailView').style.display !== 'none') {
      renderDetailPanel(clientIdx);
    }
    showToast('保单已删除', 'success');
  });
}

/* ======== 保单信息完整性检查 ======== */

/* 获取投保人信息缺失字段 */
function getClientIncompleteFields(c) {
  var missing = [];
  if (!c.idCard || c.idCard.trim() === '') missing.push('身份证');
  if (!c.phone || c.phone.trim() === '') missing.push('手机号码');
  if (!c.address || c.address.trim() === '') missing.push('联系地址');
  return missing;
}

/* 获取保单信息缺失字段 */
function getPolicyIncompleteFields(c, p) {
  var missing = [];
  /* 当被保人是投保人本人时，投保人信息已覆盖被保人信息，无需重复校验 */
  var isSelf = (p.insuredRelation === '本人') || (!p.insuredRelation && (p.insured || '') === (c.name || ''));
  if (!isSelf) {
    if (!p.insuredId || p.insuredId.trim() === '') missing.push('被保人身份证');
    if (!p.insuredPhone || p.insuredPhone.trim() === '') missing.push('被保人手机号');
    if (!p.insuredAddress || p.insuredAddress.trim() === '') missing.push('被保人联系地址');
  }
  return missing;
}

/* 获取客户所有保单的完整性问题汇总 */
function getClientAllIncompleteFields(c) {
  var clientMissing = getClientIncompleteFields(c);
  var policyMissing = [];
  if (c.policies) {
    c.policies.forEach(function(p) {
      var pm = getPolicyIncompleteFields(c, p);
      if (pm.length > 0) {
        policyMissing.push({ policyCode: p.policyCode, fields: pm });
      }
    });
  }
  return { clientMissing: clientMissing, policyMissing: policyMissing };
}

/* 检查是否有任何不完整信息 */
function hasIncompleteInfo(c) {
  var result = getClientAllIncompleteFields(c);
  return result.clientMissing.length > 0 || result.policyMissing.length > 0;
}

/* 从现有保单数据中同步险种到险种库 */
function syncExistingPoliciesToLib() {
  try {
    var lib = getInsuranceTypeLib();
    var codeMap = {};

    /* 第一遍：从现有库建立 codeMap，同名不同码的保留有名称的 */
    lib.forEach(function(item) {
      var name = (item.insuranceName || '').trim();
      var code = (item.codeType || '').trim();
      if (!code) return;
      var isPlaceholder = name.indexOf('[待补充]') === 0 || !name;

      if (!codeMap[code]) {
        /* 保留已录入的赔付/领取特征 */
        codeMap[code] = { insuranceName: name, codeType: code, traits: item.traits || null };
      } else if (!isPlaceholder) {
        var existIsPlaceholder = codeMap[code].insuranceName.indexOf('[待补充]') === 0 || !codeMap[code].insuranceName;
        if (existIsPlaceholder) {
          codeMap[code].insuranceName = name;
        }
      }
    });

    var addedCount = 0;
    var mergedCount = 0;
    var noNameCount = 0;

    /* 第二遍：扫描所有保单，以代码为唯一键合并 */
    (clientData || []).forEach(function(c) {
      (c.policies || []).forEach(function(p) {
        var name = (p.insuranceName || '').trim();
        var code = (p.codeType || '').trim();
        if (!code) return;

        if (codeMap[code]) {
          /* 代码已存在，检查能否用保单名称补全 */
          var exist = codeMap[code];
          var existIsPlaceholder = exist.insuranceName.indexOf('[待补充]') === 0 || !exist.insuranceName;
          if (name && existIsPlaceholder) {
            exist.insuranceName = name;
            mergedCount++;
          }
        } else {
          /* 新代码 */
          if (name) {
            codeMap[code] = { insuranceName: name, codeType: code };
            addedCount++;
          } else {
            codeMap[code] = { insuranceName: '[待补充] ' + code, codeType: code };
            noNameCount++;
          }
        }
      });
    });

    /* 转换回数组 */
    var newLib = [];
    Object.keys(codeMap).forEach(function(code) {
      newLib.push(codeMap[code]);
    });

    saveInsuranceTypeLib(newLib);

    if (mergedCount > 0) {
      showToast('已合并 ' + mergedCount + ' 个重复险种（按代码匹配），新增 ' + addedCount + ' 个，' + noNameCount + ' 个待补充名称', 'success');
    }
  } catch(e) {
    console.error('syncExistingPoliciesToLib error:', e);
  }
}

/* ======== 险种库管理 ======== */

/* ======== 险种赔付/领取特征 ======== */
var TRAIT_META = {
  cats: {
    '重疾险': 'cat-critical', '医疗险': 'cat-medical', '寿险': 'cat-life', '年金险': 'cat-annuity',
    '意外险': 'cat-accident', '两全险': 'cat-endowment', '分红险': 'cat-dividend', '教育金': 'cat-edu', '其他': 'cat-other'
  },
  freqLabels: {
    annual: '每年领取', semiannual: '每半年领取', quarterly: '每季度领取',
    monthly: '每月领取', triennial: '每3年领取', lumpsum: '到期一次性领取'
  }
};

/* 特征是否有内容（用于"待补全"判断） */
function hasTraitContent(t) {
  if (!t) return false;
  return !!(t.category ||
    (t.waitingPeriod !== '' && t.waitingPeriod !== undefined && t.waitingPeriod !== null) ||
    t.annuityStart || t.annuityFreq || t.note);
}

/* 类别标签HTML */
function traitCatTag(item) {
  var cat = item && item.traits && item.traits.category;
  if (!cat) return '';
  return '<span class="trait-cat ' + (TRAIT_META.cats[cat] || 'cat-other') + '">' + htmlEscape(cat) + '</span>';
}

/* 领取起始可读文案 */
function annuityStartLabel(t) {
  var v = (t.annuityStartVal || '').trim();
  if (t.annuityStart === 'afterYears') return '投保后 ' + (v ? htmlEscape(v.replace(/年$/, '')) : 'N') + ' 年起领';
  if (t.annuityStart === 'atAge') return (v ? htmlEscape(v.replace(/岁$/, '')) : 'N') + ' 岁起领';
  if (t.annuityStart === 'fixedDate') return '按' + (v ? htmlEscape(v) : '指定期限') + '起领';
  if (t.annuityStart === 'none') return '无领取责任';
  return '';
}

/* 特征chips HTML */
function traitChipsHtml(item) {
  var t = item && item.traits;
  if (!t || !hasTraitContent(t)) return '<span class="trait-chip trait-missing">待补全特征</span>';
  var chips = [];
  if (t.waitingPeriod !== '' && t.waitingPeriod !== undefined && t.waitingPeriod !== null) {
    chips.push('<span class="trait-chip tc-wait">⏳ ' + (String(t.waitingPeriod) === '0' ? '无等待期' : '等待期 ' + htmlEscape(String(t.waitingPeriod)) + ' 天') + '</span>');
  }
  var startLbl = annuityStartLabel(t);
  if (startLbl) {
    chips.push('<span class="trait-chip tc-' + (t.annuityStart === 'none' ? 'none' : 'annuity') + '">📅 ' + startLbl + '</span>');
  }
  if (t.annuityFreq && t.annuityFreq !== 'none') {
    chips.push('<span class="trait-chip tc-freq">🔁 ' + (TRAIT_META.freqLabels[t.annuityFreq] || htmlEscape(t.annuityFreq)) + '</span>');
  }
  if (t.note) chips.push('<span class="trait-chip tc-note">📝 ' + htmlEscape(t.note) + '</span>');
  return chips.join('');
}

/* 按名称/代码查找险种库条目 */
function findLibItem(name, code) {
  var lib = getInsuranceTypeLib();
  var item = null;
  if (code) {
    code = String(code).trim();
    item = lib.find(function(it) { return (it.codeType || '').trim() === code; }) || null;
  }
  if (!item && name) {
    name = String(name).trim();
    item = lib.find(function(it) { return (it.insuranceName || '').trim() === name; }) || null;
  }
  return item;
}

/* 从fromIdx之后找第一个待补全特征的下标（-1表示全部完成） */
function findNextIncompleteIdx(fromIdx) {
  var lib = getInsuranceTypeLib();
  if (lib.length === 0) return -1;
  for (var i = 1; i <= lib.length; i++) {
    var j = (fromIdx + i + lib.length) % lib.length;
    if (j === fromIdx) break;
    if (!hasTraitContent(lib[j].traits)) return j;
  }
  return -1;
}

/* —— 分段选择器交互 —— */
function setTraitSeg(segId, hiddenId, value) {
  document.getElementById(hiddenId).value = value;
  var seg = document.getElementById(segId);
  if (!seg) return;
  seg.querySelectorAll('button').forEach(function(b) {
    b.classList.toggle('active', b.dataset.v === value);
  });
}

/* 类别推荐等待期 */
function traitSuggestWait(category) {
  var map = { '重疾险': '180', '医疗险': '30', '寿险': '30' };
  return map[category] || '';
}

/* 刷新等待期推荐提示（未选择时按类别高亮常见值） */
function refreshTraitWaitSuggest() {
  var seg = document.getElementById('traitWaitSeg');
  if (!seg) return;
  var chosen = document.getElementById('traitWait').value;
  var suggest = traitSuggestWait(document.getElementById('traitCategory').value);
  seg.querySelectorAll('button').forEach(function(b) {
    b.classList.toggle('suggest', !chosen && !!suggest && b.dataset.v === suggest);
  });
}

function setTraitCategory(v) {
  setTraitSeg('traitCategorySeg', 'traitCategory', v);
  refreshTraitWaitSuggest();
}

function setTraitWait(v) {
  v = (v === undefined || v === null) ? '' : String(v);
  document.getElementById('traitWait').value = v;
  var seg = document.getElementById('traitWaitSeg');
  seg.querySelectorAll('button').forEach(function(b) { b.classList.toggle('active', b.dataset.v === v); });
  var presets = ['0', '30', '60', '90', '180'];
  document.getElementById('traitWaitCustom').value = (v !== '' && presets.indexOf(v) === -1) ? v : '';
  refreshTraitWaitSuggest();
}

function setTraitWaitCustom(val) {
  val = (val || '').trim();
  if (val === '') return;
  setTraitWait(val);
}

function setTraitAnnuityStart(v) {
  setTraitSeg('traitAnnuityStartSeg', 'traitAnnuityStart', v);
  var input = document.getElementById('traitAnnuityVal');
  var ph = {
    afterYears: '如：5（投保满5年起可领取）',
    atAge: '如：60（年满60岁起可领取）',
    fixedDate: '如：2035年1月 / 保单第10个周年日',
    none: ''
  };
  if (ph[v] !== undefined) input.placeholder = ph[v];
  input.style.display = (v === 'none') ? 'none' : 'block';
}

function setTraitAnnuityFreq(v) {
  setTraitSeg('traitAnnuityFreqSeg', 'traitAnnuityFreq', v);
}

/* 打开特征编辑器 */
function openTraitEditor(idx) {
  var lib = getInsuranceTypeLib();
  if (idx < 0 || idx >= lib.length) return;
  var item = lib[idx];
  document.getElementById('traitEditIdx').value = idx;
  document.getElementById('traitEditTitle').textContent = item.insuranceName || '未命名险种';
  document.getElementById('traitEditCode').textContent = item.codeType || '';
  var t = item.traits || {};
  setTraitCategory(t.category || '');
  setTraitWait((t.waitingPeriod === undefined || t.waitingPeriod === null) ? '' : t.waitingPeriod);
  setTraitAnnuityStart(t.annuityStart || '');
  document.getElementById('traitAnnuityVal').value = t.annuityStartVal || '';
  setTraitAnnuityFreq(t.annuityFreq || '');
  document.getElementById('traitNote').value = t.note || '';
  var nextIdx = findNextIncompleteIdx(idx);
  document.getElementById('traitSaveNextBtn').style.display = (nextIdx === -1) ? 'none' : '';
  openModal('traitModal');
}

/* 保存特征（goNext=true 时保存并跳到下一个待补全） */
function saveTraits(goNext) {
  var lib = getInsuranceTypeLib();
  var idx = parseInt(document.getElementById('traitEditIdx').value);
  if (isNaN(idx) || idx < 0 || idx >= lib.length) { showToast('险种数据异常', 'warning'); return; }
  var waitCustom = document.getElementById('traitWaitCustom').value.trim();
  var waitVal = document.getElementById('traitWait').value;
  if (waitCustom !== '') waitVal = waitCustom;
  var startType = document.getElementById('traitAnnuityStart').value;
  lib[idx].traits = {
    category: document.getElementById('traitCategory').value,
    waitingPeriod: waitVal,
    annuityStart: startType,
    annuityStartVal: (startType === 'none') ? '' : document.getElementById('traitAnnuityVal').value.trim(),
    annuityFreq: document.getElementById('traitAnnuityFreq').value,
    note: document.getElementById('traitNote').value.trim()
  };
  saveInsuranceTypeLib(lib);
  renderInsuranceTypeLib();
  if (goNext) {
    var nextIdx = findNextIncompleteIdx(idx);
    if (nextIdx === -1) {
      closeModal('traitModal');
      showToast('🎉 全部险种特征已补全', 'success');
    } else {
      openTraitEditor(nextIdx);
      showToast('已保存：' + (lib[idx].insuranceName || ''), 'success');
    }
  } else {
    closeModal('traitModal');
    showToast('险种特征已保存', 'success');
  }
}

/* 批量补全：从第一个待补全开始 */
function startTraitBatch() {
  var first = findNextIncompleteIdx(-1);
  if (first === -1) { showToast('所有险种特征均已补全', 'success'); return; }
  openTraitEditor(first);
}

/* 特征完善度横幅 */
function renderTraitProgress() {
  var el = document.getElementById('inslibTraitProgress');
  if (!el) return;
  var lib = getInsuranceTypeLib();
  if (lib.length === 0) { el.innerHTML = ''; return; }
  var done = lib.filter(function(it) { return hasTraitContent(it.traits); }).length;
  var pct = Math.round(done / lib.length * 100);
  var first = findNextIncompleteIdx(-1);
  el.innerHTML =
    '<div class="itp-head">' +
      '<div class="itp-title">赔付 / 领取特征完善度</div>' +
      (first === -1 ? '' : '<button class="btn-sm btn-warm" onclick="startTraitBatch()">开始补全</button>') +
    '</div>' +
    '<div class="itp-bar"><div class="itp-fill" style="width:' + pct + '%"></div></div>' +
    '<div class="itp-meta">' + done + ' / ' + lib.length + ' 个险种已完善（' + pct + '%）' +
    (first === -1 ? '，全部完成 🎉' : '，点击「开始补全」逐个录入等待期与领取规则') + '</div>';
}

/* 保单表单：险种特征提示条 + 生存金类型智能填充 */
function showPolicyTraitHint(libItem) {
  var bar = document.getElementById('policyTraitHint');
  if (!bar) return;
  if (!libItem || !libItem.traits || !hasTraitContent(libItem.traits)) {
    bar.classList.remove('show');
    bar.innerHTML = '';
    return;
  }
  bar.innerHTML = '<span class="pth-label">险种特征</span>' + traitCatTag(libItem) + traitChipsHtml(libItem);
  bar.classList.add('show');
  /* 生存金类型智能填充（仅当未选择时） */
  var sbSelect = document.getElementById('survivalBenefitType');
  var f = libItem.traits.annuityFreq;
  var map = { annual: 'annual', triennial: 'triennial', lumpsum: 'maturity' };
  if (f && map[f] && sbSelect && !sbSelect.value) {
    sbSelect.value = map[f];
    autoCalcSurvivalNextDate();
    showToast('已按险种库特征自动填充生存金类型：' + TRAIT_META.freqLabels[f], 'success');
  }
}


/* 获取险种库 */
function getInsuranceTypeLib() {
  try {
    return secureGetItem('insurance_type_lib_' + _idKey(), _ENC_HINT) || [];
  } catch(e) { return []; }
}

/* 保存险种库 */
function saveInsuranceTypeLib(lib) {
  secureSetItem('insurance_type_lib_' + _idKey(), lib, _ENC_HINT);
  supabaseSaveData();
}

/* 添加到险种库（去重） */
function addToInsuranceTypeLib(name, code) {
  if (!name || !code) return false;
  name = name.trim();
  code = code.trim();
  var lib = getInsuranceTypeLib();
  var exists = lib.some(function(item) {
    return (item.insuranceName || '').trim() === name && (item.codeType || '').trim() === code;
  });
  if (exists) return false;
  lib.push({ insuranceName: name, codeType: code });
  saveInsuranceTypeLib(lib);
  return true;
}

/* 手动添加险种到库 */
function addInsuranceTypeManually() {
  var name = document.getElementById('newInsLibName').value.trim();
  var code = document.getElementById('newInsLibCode').value.trim();
  if (!name || !code) { showToast('请填写险种名称和代码', 'warning'); return; }
  if (addToInsuranceTypeLib(name, code)) {
    showToast('险种已添加', 'success');
    document.getElementById('newInsLibName').value = '';
    document.getElementById('newInsLibCode').value = '';
    renderInsuranceTypeLib();
  } else {
    showToast('该险种已存在', 'warning');
  }
}

/* 渲染险种库表格 - 支持inline编辑 */
function renderInsuranceTypeLib() {
  /* 每次渲染前先从保单数据同步，确保数据不丢失 */
  syncExistingPoliciesToLib();
  var lib = getInsuranceTypeLib();
  var table = document.getElementById('insuranceTypeLibTable');
  if (!table) return;
  renderTraitProgress();
  if (lib.length === 0) {
    table.innerHTML = '<div class="empty-state" style="padding:20px;text-align:center;">' +
      '<p style="font-size:14px;color:#64748b;margin-bottom:8px;">暂无险种数据</p>' +
      '<p style="font-size:12px;color:#94a3b8;margin-bottom:16px;">可通过上方表单手动添加，或从保单数据中自动同步</p>' +
      '<button class="btn-primary" onclick="syncExistingPoliciesToLib();renderInsuranceTypeLib();" style="margin-bottom:8px;">从保单数据同步</button>' +
      '</div>';
    return;
  }
  var html = '<div class="inslib-grid">';
  lib.forEach(function(item, idx) {
    var traitDone = hasTraitContent(item.traits);
    html += '<div class="inslib-card" id="inslib_row_' + idx + '">' +
      '<div class="inslib-info" id="inslib_info_' + idx + '">' +
        '<div class="inslib-name" id="inslib_name_' + idx + '">' + (item.insuranceName || '') + '</div>' +
        '<div class="inslib-code-row">' +
          (item.codeType ? '<span class="inslib-code" id="inslib_code_' + idx + '">' + item.codeType + '</span>' : '') +
          traitCatTag(item) +
        '</div>' +
        '<div class="inslib-chips">' + traitChipsHtml(item) + '</div>' +
      '</div>' +
      '<div class="inslib-actions" id="inslib_actions_' + idx + '">' +
        '<button class="btn-sm ' + (traitDone ? 'btn-outline' : 'btn-warm') + '" onclick="openTraitEditor(' + idx + ')">特征</button>' +
        '<button class="btn-sm btn-outline" onclick="startEditInsuranceType(' + idx + ')">编辑</button>' +
        '<button class="btn-sm btn-danger" onclick="deleteInsuranceTypeByIndex(' + idx + ')">删除</button>' +
      '</div></div>';
  });
  html += '</div>';
  table.innerHTML = html;
  updateInsuranceTypeDatalist();
}

/* 进入编辑模式 - inline替换（卡片布局） */
function startEditInsuranceType(idx) {
  var lib = getInsuranceTypeLib();
  if (idx < 0 || idx >= lib.length) return;
  var item = lib[idx];
  var infoDiv = document.getElementById('inslib_info_' + idx);
  var actionsDiv = document.getElementById('inslib_actions_' + idx);
  if (!infoDiv || !actionsDiv) return;
  infoDiv.innerHTML = '<div class="inslib-edit-input">' +
    '<input type="text" id="inslib_edit_name_' + idx + '" value="' + htmlEscape(item.insuranceName) + '" placeholder="险种名称">' +
    '<input type="text" id="inslib_edit_code_' + idx + '" value="' + htmlEscape(item.codeType) + '" placeholder="险种代码">' +
    '</div>';
  actionsDiv.innerHTML = '<button class="btn-sm btn-success" onclick="saveEditInsuranceType(' + idx + ')">保存</button>' +
    '<button class="btn-sm btn-outline" onclick="cancelEditInsuranceType(' + idx + ')">取消</button>';
}

/* HTML转义 */
function htmlEscape(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* 保存编辑 */
function saveEditInsuranceType(idx) {
  var lib = getInsuranceTypeLib();
  if (idx < 0 || idx >= lib.length) return;
  var newName = document.getElementById('inslib_edit_name_' + idx).value.trim();
  var newCode = document.getElementById('inslib_edit_code_' + idx).value.trim();
  if (!newName) { showToast('险种名称不能为空', 'warning'); return; }
  if (!newCode) { showToast('险种代码不能为空', 'warning'); return; }
  var oldName = lib[idx].insuranceName;
  lib[idx].insuranceName = newName;
  lib[idx].codeType = newCode;
  saveInsuranceTypeLib(lib);
  /* 同步更新保单 */
  var syncCount = 0;
  clientData.forEach(function(c) {
    (c.policies || []).forEach(function(p) {
      if ((p.insuranceName || '').trim() === oldName.trim()) {
        p.insuranceName = newName;
        p.codeType = newCode;
        syncCount++;
      }
    });
  });
  if (syncCount > 0) savePolicyData();
  renderInsuranceTypeLib();
  showToast(syncCount > 0 ? '险种已更新，同步 ' + syncCount + ' 份保单' : '险种已更新', 'success');
}

/* 取消编辑 */
function cancelEditInsuranceType(idx) {
  renderInsuranceTypeLib();
}

/* 删除险种（按索引） */
function deleteInsuranceTypeByIndex(idx) {
  var lib = getInsuranceTypeLib();
  if (idx < 0 || idx >= lib.length) return;
  var name = lib[idx].insuranceName || '';
  showConfirm('确定要删除险种 "' + name + '" 吗？', function() {
    var lib = getInsuranceTypeLib();
    lib.splice(idx, 1);
    saveInsuranceTypeLib(lib);
    renderInsuranceTypeLib();
    showToast('险种已删除', 'success');
  });
}

/* 自动填充险种代码（名称→代码）- 同时自动将新险种录入险种库 */
function syncInsuranceTypeToForm(name) {
  if (!name) { showPolicyTraitHint(null); return; }
  name = name.trim();
  var lib = getInsuranceTypeLib();
  var match = lib.find(function(item) { return (item.insuranceName || '').trim() === name; });
  if (match) {
    document.getElementById('codeType').value = match.codeType || '';
    showPolicyTraitHint(match);
  } else {
    /* 名称不在库中，检查当前代码是否在库中 */
    var codeEl = document.getElementById('codeType');
    var code = (codeEl && codeEl.value || '').trim();
    if (code) {
      var codeMatch = lib.find(function(item) { return (item.codeType || '').trim() === code; });
      if (!codeMatch) {
        /* 代码也不在库中，新增险种到险种库 */
        lib.push({ insuranceName: name, codeType: code });
        saveInsuranceTypeLib(lib);
        showToast('已自动录入险种库：' + code + ' - ' + name, 'success');
      } else {
        /* 代码在库中但名称为待补充或不同，更新名称 */
        var existName = (codeMatch.insuranceName || '').trim();
        if (!existName || existName.indexOf('[待补充]') === 0) {
          codeMatch.insuranceName = name;
          saveInsuranceTypeLib(lib);
          showToast('已补全险种名称：' + code + ' - ' + name, 'success');
        }
      }
    }
  }
  /* 检测生存金类型 */
  if (checkSurvivalBenefitType(name)) {
    showSurvivalBenefitHint();
  } else {
    hideSurvivalBenefitHint();
  }
}

/* 自动检索险种名称（代码→名称）- 填入险种代码后自动匹配险种库 */
function syncInsuranceNameFromCode(code) {
  if (!code) return;
  code = code.trim();
  var lib = getInsuranceTypeLib();
  var match = lib.find(function(item) { return (item.codeType || '').trim() === code; });
  if (match) {
    var name = (match.insuranceName || '').trim();
    if (name && name.indexOf('[待补充]') === -1) {
      document.getElementById('insuranceName').value = name;
      showPolicyTraitHint(match);
      showToast('已匹配险种：' + name, 'success');
      if (checkSurvivalBenefitType(name)) {
        showSurvivalBenefitHint();
      }
    } else {
      showToast('该代码对应险种名称待补充，请手动填写险种名称', 'warning');
      document.getElementById('insuranceName').value = '';
      showPolicyTraitHint(null);
      document.getElementById('insuranceName').focus();
    }
  } else {
    showToast('请输入保单险种名称', 'warning');
    document.getElementById('insuranceName').value = '';
    document.getElementById('insuranceName').focus();
  }
}

/* 检测是否为生存金相关险种 */
function checkSurvivalBenefitType(name) {
  if (!name) return false;
  var keywords = ['年金', '分红', '养老', '理财', '生存金', '返还', '领取', '两全'];
  for (var i = 0; i < keywords.length; i++) {
    if (name.indexOf(keywords[i]) !== -1) return true;
  }
  return false;
}

/* 显示生存金提示 */
function showSurvivalBenefitHint() {
  var hint = document.getElementById('survivalBenefitHint');
  if (hint) hint.classList.add('show');
}

/* 隐藏生存金提示 */
function hideSurvivalBenefitHint() {
  var hint = document.getElementById('survivalBenefitHint');
  if (hint) hint.classList.remove('show');
}

/* 检查险种名称并显示/隐藏生存金提示 */
function checkSurvivalBenefitHint(name) {
  if (checkSurvivalBenefitType(name)) {
    showSurvivalBenefitHint();
  } else {
    hideSurvivalBenefitHint();
  }
}

/* 自动计算下次领取日期 */
function autoCalcSurvivalNextDate() {
  var type = document.getElementById('survivalBenefitType').value;
  var startDateStr = document.getElementById('survivalStartDate').value;
  var lastDateStr = document.getElementById('survivalLastDate').value;
  var nextDateInput = document.getElementById('survivalNextDate');

  if (!type) {
    return;
  }

  /* 使用起领日作为计算基准 */
  var baseDateStr = startDateStr || lastDateStr;
  if (!baseDateStr) return;

  var parts = baseDateStr.split('-');
  if (parts.length !== 3) return;
  var y = parseInt(parts[0]);
  var m = parseInt(parts[1]);
  var d = parseInt(parts[2]);

  var nextDate = null;
  var today = new Date();

  if (type === 'annual') {
    /* 从起领日开始，计算到当前最近的未领取年份 */
    var startDate = new Date(y, m - 1, d);
    nextDate = new Date(startDate);
    while (nextDate <= today) {
      nextDate.setFullYear(nextDate.getFullYear() + 1);
    }
  } else if (type === 'triennial') {
    var startDate = new Date(y, m - 1, d);
    nextDate = new Date(startDate);
    while (nextDate <= today) {
      nextDate.setFullYear(nextDate.getFullYear() + 3);
    }
  } else if (type === 'maturity') {
    nextDateInput.value = '';
    return;
  }

  if (nextDate) {
    var ny = nextDate.getFullYear();
    var nm = String(nextDate.getMonth() + 1).padStart(2, '0');
    var nd = String(nextDate.getDate()).padStart(2, '0');
    nextDateInput.value = ny + '-' + nm + '-' + nd;
  }
}

/* 更新datalist */
function updateInsuranceTypeDatalist() {
  var datalist = document.getElementById('insuranceTypeList');
  if (!datalist) return;
  var lib = getInsuranceTypeLib();
  datalist.innerHTML = '';
  lib.forEach(function(item) {
    var opt = document.createElement('option');
    opt.value = item.insuranceName;
    datalist.appendChild(opt);
  });
}

