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
    /* 编辑：保留原有保单和联系记录 */
    clientObj.policies = clientData[editIdx].policies || [];
    clientObj.contactHistory = clientData[editIdx].contactHistory || [];
    clientData[editIdx] = clientObj;
    showToast('客户信息已更新', 'success');
  } else {
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
  openModal('policyModal');
}

/* 清空保单表单 */
function clearPolicyForm() {
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
        codeMap[code] = { insuranceName: name, codeType: code };
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
    html += '<div class="inslib-card" id="inslib_row_' + idx + '">' +
      '<div class="inslib-info" id="inslib_info_' + idx + '">' +
        '<div class="inslib-name" id="inslib_name_' + idx + '">' + (item.insuranceName || '') + '</div>' +
        '<span class="inslib-code" id="inslib_code_' + idx + '">' + (item.codeType || '') + '</span>' +
      '</div>' +
      '<div class="inslib-actions" id="inslib_actions_' + idx + '">' +
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
  if (!name) return;
  name = name.trim();
  var lib = getInsuranceTypeLib();
  var match = lib.find(function(item) { return (item.insuranceName || '').trim() === name; });
  if (match) {
    document.getElementById('codeType').value = match.codeType || '';
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
      showToast('已匹配险种：' + name, 'success');
      if (checkSurvivalBenefitType(name)) {
        showSurvivalBenefitHint();
      }
    } else {
      showToast('该代码对应险种名称待补充，请手动填写险种名称', 'warning');
      document.getElementById('insuranceName').value = '';
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

