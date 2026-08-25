/* ======== 联系记录 ======== */
var contactModalClientIdx = -1; /* 联系记录弹窗针对的客户（支持从服务锦囊等处直接打开） */
function openAddContactModal(clientIdx) {
  contactModalClientIdx = (clientIdx === undefined || clientIdx === null) ? selectedClientIdx : clientIdx;
  document.getElementById('contactDate').value = new Date().toISOString().slice(0, 10);
  document.getElementById('contactNote').value = '';
  document.getElementById('contactStatus').value = '已电话联系';
  openModal('contactModal');
}

function saveContactRecord() {
  var targetIdx = (contactModalClientIdx >= 0 && contactModalClientIdx < clientData.length) ? contactModalClientIdx : selectedClientIdx;
  if (targetIdx < 0 || targetIdx >= clientData.length) return;
  contactModalClientIdx = -1;
  var record = {
    status: document.getElementById('contactStatus').value,
    date: toYMD(document.getElementById('contactDate').value),
    note: document.getElementById('contactNote').value.trim()
  };
  if (!clientData[targetIdx].contactHistory) clientData[targetIdx].contactHistory = [];
  clientData[targetIdx].contactHistory.unshift(record);
  savePolicyData();
  closeModal('contactModal');
  if (currentTab === 'query' && document.getElementById('clientDetailView').style.display !== 'none') {
    renderDetailPanel(targetIdx);
  }
  /* 服务锦囊页打开时刷新（长期未联系线索可能因此消除） */
  if (currentTab === 'reminders') renderServiceLeads();
  showToast('联系记录已保存', 'success');

  /* ★ 接触客户后，若画像缺失则提醒补全 */
  var _cc = clientData[targetIdx];
  if (isProfileIncomplete(_cc)) {
    setTimeout(function() {
      showConfirm('为保持对「' + ((_cc && _cc.name) || '该客户') + '」的持续了解，是否现在补全客户画像（个人情况、家庭情况备注）？', function() {
        openProfileModal(targetIdx);
      }, '现在补全');
    }, 420);
  }
}

/* 切换「不继续服务」标记 */
function toggleDoNotContact(clientIdx) {
  if (clientIdx < 0 || clientIdx >= clientData.length) return;
  var c = clientData[clientIdx];
  c.doNotContact = !c.doNotContact;
  savePolicyData();
  renderDetailPanel(clientIdx);
  if (currentTab === 'query') handleSearch();
  showToast(c.doNotContact ? '已标记为不继续服务，该客户将排在列表末尾' : '已取消不继续服务标记', 'success');
}

/* ======== 服务记录 ======== */
function openAddServiceModal(clientIdx, policyIdx) {
  document.getElementById('serviceClientIdx').value = clientIdx;
  document.getElementById('servicePolicyIdx').value = policyIdx;
  document.getElementById('serviceDate').value = new Date().toISOString().slice(0, 10);
  document.getElementById('serviceContent').value = '';
  openModal('serviceModal');
}

function saveServiceRecord() {
  var clientIdx = parseInt(document.getElementById('serviceClientIdx').value);
  var policyIdx = parseInt(document.getElementById('servicePolicyIdx').value);
  var record = {
    date: toYMD(document.getElementById('serviceDate').value),
    content: document.getElementById('serviceContent').value.trim()
  };
  if (!clientData[clientIdx].policies[policyIdx].serviceRecords) {
    clientData[clientIdx].policies[policyIdx].serviceRecords = [];
  }
  clientData[clientIdx].policies[policyIdx].serviceRecords.unshift(record);
  savePolicyData();
  closeModal('serviceModal');
  if (selectedClientIdx === clientIdx && currentTab === 'query' && document.getElementById('clientDetailView').style.display !== 'none') {
    renderDetailPanel(clientIdx);
  }
  showToast('服务记录已保存', 'success');
}

/* ======== 数据导入导出 ======== */

/* 导出数据 */
function exportData() {
  var data = {
    policies: clientData,
    exportDate: new Date().toISOString(),
    user: currentUser
  };
  var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = '保单数据_' + currentUser + '_' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
  URL.revokeObjectURL(url);
  showToast('数据导出成功', 'success');
}

/* ======== 增强导入导出功能 ======== */

/* 兼容性JSON导入 - 支持直接数组和包装格式两种 */
function importData(e) {
  var file = e.target.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(ev) {
    try {
      var raw = JSON.parse(ev.target.result);
      /* 判断数据格式 */
      var arrData = null;
      if (Array.isArray(raw)) {
        /* 格式一：直接是数组 [{name, idCard, ...}, ...] */
        arrData = raw;
      } else if (raw && raw.policies && Array.isArray(raw.policies)) {
        /* 格式二：包装格式 {policies: [...], ...} */
        arrData = raw.policies;
      }
      if (!arrData || !Array.isArray(arrData) || arrData.length === 0) {
        showToast('未找到有效的客户数据', 'warning');
        return;
      }
      /* 标准化每条记录，确保字段完整 */
      var normalized = arrData.map(function(item) {
        return {
          name: item.name || '',
          idCard: item.idCard || '',
          phone: item.phone || '',
          address: item.address || '',
          workCompany: item.workCompany || '',
          workAddress: item.workAddress || '',
          policies: (item.policies || []).map(function(p) {
            return {
              policyCode: p.policyCode || '',
              insuranceName: p.insuranceName || '',
              codeType: p.codeType || '',
              mainType: p.mainType || '主险',
              parentPolicyCode: p.parentPolicyCode || '',
              status: p.status || '',
              effectiveDate: p.effectiveDate || '',
              paymentMethod: p.paymentMethod || '年缴',
              annualPremium: p.annualPremium || '',
              sumInsured: p.sumInsured || '',
              paymentTerm: p.paymentTerm || '',
              paymentBank: p.paymentBank || '',
              paymentBankCard: p.paymentBankCard || '',
              insured: p.insured || '',
              insuredRelation: p.insuredRelation || '',
              insuredId: p.insuredId || '',
              insuredPhone: p.insuredPhone || '',
              beneficiaries: p.beneficiaries || [],
              remark: p.remark || '',
              extraFields: p.extraFields || {},
              serviceRecords: p.serviceRecords || []
            };
          }),
          familyMembers: item.familyMembers || [],
          contactHistory: item.contactHistory || []
        };
      });
      showConfirm('检测到 ' + normalized.length + ' 位客户数据。确定导入将覆盖当前数据。', function() {
        clientData = normalized;
        savePolicyData();
        refreshCurrentTab();
        updateBottomStats();
        autoSyncPush();
        showToast('成功导入 ' + normalized.length + ' 位客户数据', 'success');
      });
    } catch(err) {
      showToast('JSON文件解析失败：' + err.message, 'error');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}

/* 提示导入数据 */
function importDataPrompt() {
  document.getElementById('importFileInput').click();
}

/* 触发Excel文件选择 */
function importExcelPrompt() {
  document.getElementById('importExcelInput').click();
}

/* Excel批量导入 */
function importExcelData(e) {
  var file = e.target.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(ev) {
    try {
      var data = new Uint8Array(ev.target.result);
      var workbook = XLSX.read(data, { type: 'array' });
      var sheetName = workbook.SheetNames[0];
      var sheet = workbook.Sheets[sheetName];
      var rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      if (rows.length === 0) {
        showToast('Excel文件中没有数据行', 'warning');
        return;
      }
      /* 按投保人姓名分组 */
      var clientMap = {};
      rows.forEach(function(row) {
        var name = (row['投保人姓名'] || '').toString().trim();
        if (!name) return;
        if (!clientMap[name]) {
          clientMap[name] = {
            name: name,
            idCard: (row['投保人身份证号'] || '').toString().trim(),
            phone: (row['联系电话'] || '').toString().trim(),
            address: (row['通信地址'] || '').toString().trim(),
            workCompany: (row['工作单位'] || '').toString().trim(),
            workAddress: (row['工作地址'] || '').toString().trim(),
            policies: [],
            familyMembers: [],
            contactHistory: []
          };
        }
        /* 解析受益人 */
        var beneficiaries = [];
        var beneStr = (row['受益人'] || '').toString().trim();
        if (beneStr) {
          var parts = beneStr.split(/[\/、,，]/);
          var quotaEach = Math.round(100 / parts.length);
          parts.forEach(function(part, i) {
            part = part.trim();
            if (part) {
              beneficiaries.push({
                name: part,
                quota: i === parts.length - 1 ? 100 - quotaEach * (parts.length - 1) : quotaEach
              });
            }
          });
        }
        var policy = {
          policyCode: (row['保单代码'] || '').toString().trim(),
          insuranceName: (row['险种名称'] || '').toString().trim(),
          codeType: (row['险种代码'] || '').toString().trim(),
          mainType: (row['主险/附加险'] || '主险').toString().trim(),
          parentPolicyCode: (row['关联主险代码'] || '').toString().trim(),
          status: (row['保单状态'] || '有效').toString().trim(),
          effectiveDate: (row['生效日'] || '').toString().trim().replace(/-/g, ''),
          paymentMethod: (row['缴费方式'] || '年缴').toString().trim(),
          annualPremium: (row['年缴保费（元）'] || '').toString().trim(),
          sumInsured: (row['保额（元）'] || '').toString().trim(),
          paymentTerm: (row['缴费期限（年）'] || '').toString().trim(),
          paymentBank: (row['缴费银行'] || '').toString().trim(),
          paymentBankCard: (row['银行卡后四位'] || '').toString().trim(),
          insured: (row['被保险人'] || '').toString().trim(),
          insuredRelation: (row['与被保人关系'] || '').toString().trim(),
          insuredId: (row['被保人身份证'] || '').toString().trim(),
          insuredPhone: (row['被保人手机号码'] || '').toString().trim(),
          beneficiaries: beneficiaries,
          remark: (row['备注'] || '').toString().trim(),
          extraFields: {},
          serviceRecords: []
        };
        clientMap[name].policies.push(policy);
      });
      var clientList = Object.values(clientMap);
      showConfirm('从Excel解析到 ' + clientList.length + ' 位客户数据。确定导入将覆盖当前数据。', function() {
        clientData = clientList;
        savePolicyData();
        refreshCurrentTab();
        updateBottomStats();
        autoSyncPush();
        showToast('Excel导入成功，共 ' + clientList.length + ' 位客户', 'success');
      });
    } catch(err) {
      showToast('Excel解析失败：' + err.message, 'error');
    }
  };
  reader.readAsArrayBuffer(file);
  e.target.value = '';
}

/* 导出Excel导入模板 */
function exportExcelTemplate() {
  var headers = [
    '投保人姓名', '投保人身份证号', '联系电话', '通信地址', '工作单位', '工作地址',
    '险种名称', '保单代码', '险种代码', '主险/附加险', '关联主险代码', '保单状态',
    '生效日', '缴费方式', '年缴保费（元）', '保额（元）', '缴费期限（年）', '缴费银行', '银行卡后四位',
    '被保险人', '与被保人关系', '被保人身份证', '被保人手机号码', '受益人', '备注'
  ];
  var exampleData = [
    {
      '投保人姓名': '张三', '投保人身份证号': '110101199001011234', '联系电话': '13800138000',
      '通信地址': '北京市朝阳区某某路1号', '工作单位': '某某公司', '工作地址': '',
      '险种名称': '国寿防癌疾病保险', '保单代码': '2017442001522015000001', '险种代码': '522',
      '主险/附加险': '主险', '关联主险代码': '', '保单状态': '有效',
      '生效日': '20170112', '缴费方式': '年缴', '年缴保费（元）': '780',
      '保额（元）': '100000', '缴费期限（年）': '20', '缴费银行': '工商银行', '银行卡后四位': '6789', '被保险人': '李四', '与被保人关系': '配偶',
      '被保人身份证': '', '被保人手机号码': '', '受益人': '张三', '备注': ''
    },
    {
      '投保人姓名': '张三', '投保人身份证号': '', '联系电话': '',
      '通信地址': '', '工作单位': '', '工作地址': '',
      '险种名称': '国寿附加意外伤害保险', '保单代码': '2017442001778300000001', '险种代码': '778',
      '主险/附加险': '附加险', '关联主险代码': '2017442001522015000001', '保单状态': '有效',
      '生效日': '20170112', '缴费方式': '年缴', '年缴保费（元）': '82',
      '保额（元）': '50000', '缴费期限（年）': '20', '缴费银行': '工商银行', '银行卡后四位': '6789', '被保险人': '李四', '与被保人关系': '配偶',
      '被保人身份证': '', '被保人手机号码': '', '受益人': '张三', '备注': '附加险示例'
    }
  ];
  var ws = XLSX.utils.json_to_sheet(exampleData, { header: headers });
  ws['!cols'] = headers.map(function(h) {
    return { wch: Math.max(h.length * 2, 12) };
  });
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '保单数据');
  XLSX.writeFile(wb, '保单导入模板.xlsx');
  showToast('Excel模板已下载', 'success');
}

/* ======== 智能Excel导入向导 - JS逻辑 ======== */

/* 向导全局状态 */
var _wiz = {
  step: 1,
  rows: [],           // 原始解析行
  headers: [],        // 原始表头
  clients: [],        // 归一化后的客户对象
  matchedMap: [],     // 每条客户匹配到的现有客户索引（-1为新客户）
  fileName: '',
  badIdCardCount: 0,
  totalPolicies: 0,
  stats: { newClients: 0, mergeClients: 0 }
};

/* 标准列别名映射：别名 -> 标准列名（与现有importExcelData中使用的中文列名一致） */
var _COL_ALIASES = {
  '投保人姓名': ['投保人姓名','姓名','客户姓名','客户名','客户','投保人','name','客户名称'],
  '投保人身份证号': ['投保人身份证号','身份证号','身份证','idcard','id','投保人身份证','证件号','客户身份证'],
  '联系电话': ['联系电话','电话','手机','手机号','phone','tel','手机号码','联系手机','联系'],
  '通信地址': ['通信地址','地址','住址','家庭住址','家庭地址','address','联系地址'],
  '工作单位': ['工作单位','单位','company','雇主','就职单位'],
  '工作地址': ['工作地址','单位地址','company address','办公地址'],
  '险种名称': ['险种名称','险种','保险名称','产品名称','insurance','保险产品'],
  '保单代码': ['保单代码','保单号','保单编号','policy','policy code','合同号','保险单号','保单ID'],
  '险种代码': ['险种代码','产品代码','险种编码','代码','code type','险种编号','产品编码'],
  '主险/附加险': ['主险/附加险','险别','类型','主附险','主险标志','险种类别','main'],
  '关联主险代码': ['关联主险代码','主险代码','父保单','关联主险','parent policy code','附加险关联'],
  '保单状态': ['保单状态','状态','status','合同状态','有效状态'],
  '生效日': ['生效日','生效日期','起保日期','起期','effective','生效时间'],
  '缴费方式': ['缴费方式','交纳方式','交费方式','payment method','缴费类型','付费方式'],
  '年缴保费（元）': ['年缴保费（元）','年缴保费','保费','年交保费','premium','保费金额','年保费','首期保费'],
  '保额（元）': ['保额（元）','保额','基本保额','保险金额','sum insured','保险金','保障额度'],
  '缴费期限（年）': ['缴费期限（年）','缴费期限','交费年期','缴费年限','payment term','交费期限','交费年数'],
  '缴费银行': ['缴费银行','银行','开户行','bank','缴费账户行'],
  '银行卡后四位': ['银行卡后四位','卡号','银行账户','银行卡','账号','银行尾号','缴费卡号'],
  '被保险人': ['被保险人','被保人','insured','受保人'],
  '与被保人关系': ['与被保人关系','关系','relation','与投保人关系','被保人关系'],
  '被保人身份证': ['被保人身份证','被保人证件号','被保险人身份证号','insured id'],
  '被保人手机号码': ['被保人手机号码','被保人电话','被保手机','被保险人电话','insured phone','被保险人手机'],
  '受益人': ['受益人','身故受益人','beneficiary','受益人姓名','benefit'],
  '备注': ['备注','remark','notes','说明','附记']
};

/* 列名智能匹配 */
function _wizLookupColumn(row, standardName) {
  var aliases = _COL_ALIASES[standardName] || [standardName];
  /* 先精确找 */
  for (var i = 0; i < aliases.length; i++) {
    for (var key in row) {
      if (row.hasOwnProperty(key) && key && key.toString().trim() === aliases[i]) {
        return row[key];
      }
    }
  }
  /* 再模糊匹配：别名是列名子串，或列名是别名子串 */
  for (var j = 0; j < aliases.length; j++) {
    var alias = aliases[j];
    for (var k in row) {
      if (!row.hasOwnProperty(k) || !k) continue;
      var kl = k.toString().trim();
      if (kl && alias && (kl.indexOf(alias) !== -1 || alias.indexOf(kl) !== -1)) {
        return row[k];
      }
    }
  }
  return '';
}

/* 日期智能清洗：统一转为YYYYMMDD */
function _wizNormalizeDate(v) {
  if (v === null || v === undefined) return '';
  var s = v.toString().trim();
  if (!s) return '';
  /* SheetJS的Excel序列号日期 */
  if (typeof v === 'number' && v > 10000 && v < 100000) {
    try {
      var epoch = new Date(Date.UTC(1899, 11, 30));
      var d = new Date(epoch.getTime() + Math.round(v) * 86400000);
      var y = d.getUTCFullYear();
      var m = String(d.getUTCMonth() + 1).padStart(2, '0');
      var dd = String(d.getUTCDate()).padStart(2, '0');
      return '' + y + m + dd;
    } catch(e) {}
  }
  /* 日期对象 */
  if (v instanceof Date && !isNaN(v)) {
    return '' + v.getFullYear() + String(v.getMonth() + 1).padStart(2, '0') + String(v.getDate()).padStart(2, '0');
  }
  /* 去除分隔符 YYYY-MM-DD / YYYY/MM/DD / YYYY.MM.DD / YYYY年M月D日 */
  s = s.replace(/[年\.]/g, '-').replace(/月/g, '-').replace(/日/g, '').replace(/\//g, '-');
  var m = s.match(/(\d{4})-?(\d{1,2})-?(\d{1,2})/);
  if (m) {
    return m[1] + String(parseInt(m[2])).padStart(2, '0') + String(parseInt(m[3])).padStart(2, '0');
  }
  /* 仅年月日纯数字 8位/6位 */
  var n = s.replace(/\D/g, '');
  if (n.length === 8) return n;
  if (n.length === 6) return '20' + n; /* 20xx年补齐 */
  /* 最终降级保留数字 */
  return n.substring(0, 8);
}

/* 金额/数字清洗 */
function _wizNum(v) {
  if (v === null || v === undefined || v === '') return '';
  var s = v.toString().replace(/[,，\s元￥¥]/g, '');
  var num = parseFloat(s);
  return isNaN(num) ? v : num;
}

/* 校验身份证有效性（简单版：位数+出生日期） */
function _wizIsValidId(id) {
  if (!id) return false;
  var s = id.toString().trim();
  if (!/^\d{15}(\d{2}[\dxX])?$/.test(s)) return false;
  if (s.length === 18) {
    var y = parseInt(s.substring(6,10));
    var m = parseInt(s.substring(10,12));
    var d = parseInt(s.substring(12,14));
    if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  }
  return true;
}

/* 打开导入向导 */
function openImportWizard() {
  _wiz = {
    step: 1, rows: [], headers: [], clients: [], matchedMap: [], fileName: '',
    badIdCardCount: 0, totalPolicies: 0, stats: { newClients: 0, mergeClients: 0 }
  };
  /* 重置面板 */
  for (var s = 1; s <= 3; s++) {
    document.getElementById('wizPanel' + s).classList.toggle('active', s === 1);
    document.getElementById('wizStep' + s).className = s === 1 ? 'active' : '';
  }
  document.getElementById('wizFileName').textContent = '';
  document.getElementById('wizPrevBtn').style.display = 'none';
  document.getElementById('wizNextBtn').style.display = 'inline-block';
  document.getElementById('wizNextBtn').disabled = true;
  document.getElementById('wizConfirmBtn').style.display = 'none';
  document.getElementById('wizPreviewTable').innerHTML = '<thead><tr><th>等待解析数据...</th></tr></thead><tbody></tbody>';
  document.getElementById('wizLegend').style.display = 'none';
  var input = document.getElementById('importWizardInput');
  input.value = '';
  input.onchange = function(e) { _wizOnFileChosen(e); };
  openModal('importWizardModal');
}

function _wizOnFileChosen(e) {
  var file = e.target.files[0];
  if (!file) return;
  _wiz.fileName = file.name;
  document.getElementById('wizFileName').textContent = '✅ 已选文件：' + file.name + '（' + (file.size / 1024).toFixed(1) + ' KB）';
  document.getElementById('wizNextBtn').disabled = false;
}

/* 向导步骤切换 */
function wizGoStep(dir) {
  var newStep = _wiz.step + dir;
  if (newStep < 1 || newStep > 3) return;
  if (newStep === 2 && _wiz.rows.length === 0) {
    /* 进入第2步前解析文件 */
    var input = document.getElementById('importWizardInput');
    if (!input.files || !input.files[0]) {
      showToast('请先选择Excel文件', 'warning'); return;
    }
    _wizParseFile(input.files[0], function() {
      _wiz.step = 2;
      _wizRenderStep();
    });
    return;
  }
  if (newStep === 3 && _wiz.clients.length === 0) {
    /* 第3步：做匹配 */
    _wizDoMatch();
  }
  _wiz.step = newStep;
  _wizRenderStep();
}

function _wizRenderStep() {
  for (var s = 1; s <= 3; s++) {
    document.getElementById('wizPanel' + s).classList.toggle('active', s === _wiz.step);
    var stepper = document.getElementById('wizStep' + s);
    stepper.className = (s === _wiz.step) ? 'active' : (s < _wiz.step ? 'done' : '');
  }
  document.getElementById('wizPrevBtn').style.display = _wiz.step === 1 ? 'none' : 'inline-block';
  document.getElementById('wizNextBtn').style.display = _wiz.step === 3 ? 'none' : 'inline-block';
  document.getElementById('wizConfirmBtn').style.display = _wiz.step === 3 ? 'inline-block' : 'none';

  if (_wiz.step === 3) {
    _wizDoMatch();
    _wizRenderStats();
  }
}

/* 解析Excel/CSV文件 */
function _wizParseFile(file, cb) {
  showToast('正在解析Excel文件...', 'info');
  var reader = new FileReader();
  reader.onload = function(ev) {
    try {
      /* 针对CSV的UTF-8 BOM/GBK处理：先用Text读（CSV），失败转ArrayBuffer(XLSX) */
      var rows;
      var ext = (file.name.split('.').pop() || '').toLowerCase();
      if (ext === 'csv') {
        var text = ev.target.result;
        if (text.charCodeAt(0) === 0xFEFF) text = text.substring(1); /* 去BOM */
        var wb = XLSX.read(text, { type: 'string' });
        rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: true });
      } else {
        var data = new Uint8Array(ev.target.result);
        var wb2 = XLSX.read(data, { type: 'array', cellDates: true });
        rows = XLSX.utils.sheet_to_json(wb2.Sheets[wb2.SheetNames[0]], { defval: '', raw: true });
      }
      if (rows.length === 0) { showToast('Excel中没有有效数据行', 'warning'); return; }
      _wiz.rows = rows;
      /* 取表头（原始列名集合） */
      if (rows.length > 0) _wiz.headers = Object.keys(rows[0]);
      /* 渲染预览表 */
      _wizRenderPreview();
      showToast('解析成功：' + rows.length + ' 行数据', 'success');
      cb && cb();
    } catch(err) {
      showToast('解析失败：' + err.message, 'error');
    }
  };
  var ext = (file.name.split('.').pop() || '').toLowerCase();
  if (ext === 'csv') reader.readAsText(file);
  else reader.readAsArrayBuffer(file);
}

function _wizRenderPreview() {
  var table = document.getElementById('wizPreviewTable');
  var rows = _wiz.rows;
  var showRows = rows.slice(0, 20);
  var thead = '<tr>' + _wiz.headers.map(function(h) { return '<th>' + (h || '(空列)') + '</th>'; }).join('') + '</tr>';
  var tbody = '';
  showRows.forEach(function(r, i) {
    tbody += '<tr>';
    _wiz.headers.forEach(function(h) {
      var v = r[h];
      if (v instanceof Date) v = v.toLocaleDateString('zh-CN');
      else if (typeof v === 'string' && v.length > 20) v = v.substring(0, 20) + '...';
      tbody += '<td>' + (v === undefined || v === null || v === '' ? '<span style="color:#cbd5e1;">空</span>' : v) + '</td>';
    });
    tbody += '</tr>';
  });
  table.innerHTML = '<thead>' + thead + '</thead><tbody>' + tbody + '</tbody>';
  var info = '共 ' + rows.length + ' 行 · ' + _wiz.headers.length + ' 列';
  if (rows.length > 20) info += ' · 仅显示前20行预览';
  document.getElementById('wizRawInfo').textContent = info;
}

/* 客户匹配算法：身份证 > 手机号 > 姓名+地址 */
function _wizFindExistingClient(c) {
  var id = (c.idCard || '').toString().trim();
  var ph = (c.phone || '').toString().trim();
  var name = (c.name || '').toString().trim();
  var addr = (c.address || '').toString().trim();
  for (var i = 0; i < clientData.length; i++) {
    var ex = clientData[i];
    var exId = (ex.idCard || '').toString().trim();
    var exPh = (ex.phone || '').toString().trim();
    var exName = (ex.name || '').toString().trim();
    var exAddr = (ex.address || '').toString().trim();
    /* 身份证精准匹配 */
    if (id && exId && id === exId) return { idx: i, reason: '身份证一致' };
    /* 手机号精准匹配 */
    if (ph && exPh && ph === exPh && name === exName) return { idx: i, reason: '姓名+手机号一致' };
    /* 姓名+地址模糊匹配 */
    if (name && exName && name === exName && addr && exAddr) {
      var common = 0;
      for (var ch = 0; ch < Math.min(addr.length, exAddr.length); ch++) if (addr[ch] === exAddr[ch]) common++;
      if (common >= 4) return { idx: i, reason: '姓名+地址高度一致' };
    }
  }
  return { idx: -1, reason: '新客户' };
}

/* 归一化行 -> 客户/保单对象 + 做匹配 */
function _wizDoMatch() {
  /* StepA: 行转标准对象，按姓名分组(同客户) */
  var groupMap = {};
  var groupKeys = [];
  _wiz.badIdCardCount = 0;
  _wiz.totalPolicies = 0;
  _wiz.rows.forEach(function(row) {
    /* 取投保人姓名，如空则用手机号兜底，都空跳过 */
    var name = (_wizLookupColumn(row, '投保人姓名') || '').toString().trim();
    var idCard = (_wizLookupColumn(row, '投保人身份证号') || '').toString().trim();
    var phone = (_wizLookupColumn(row, '联系电话') || '').toString().trim();
    if (!name && !phone) return;
    var gKey = '###' + (name || '') + '###' + (idCard || '') + '###' + (phone || '');
    if (!groupMap[gKey]) {
      groupMap[gKey] = {
        name: name,
        idCard: idCard,
        phone: phone,
        address: (_wizLookupColumn(row, '通信地址') || '').toString().trim(),
        workCompany: (_wizLookupColumn(row, '工作单位') || '').toString().trim(),
        workAddress: (_wizLookupColumn(row, '工作地址') || '').toString().trim(),
        policies: [],
        familyMembers: [],
        contactHistory: []
      };
      groupKeys.push(gKey);
      if (idCard && !_wizIsValidId(idCard)) _wiz.badIdCardCount++;
    } else {
      /* 已有客户信息，空白则补齐 */
      if (!groupMap[gKey].idCard && idCard) groupMap[gKey].idCard = idCard;
      if (!groupMap[gKey].phone && phone) groupMap[gKey].phone = phone;
      if (!groupMap[gKey].address) groupMap[gKey].address = (_wizLookupColumn(row, '通信地址') || '').toString().trim();
      if (!groupMap[gKey].workCompany) groupMap[gKey].workCompany = (_wizLookupColumn(row, '工作单位') || '').toString().trim();
    }
    /* 受益人解析 */
    var bene = [];
    var beneStr = (_wizLookupColumn(row, '受益人') || '').toString().trim();
    if (beneStr) {
      var bp = beneStr.split(/[\/、,，]/);
      var eachQuota = Math.round(100 / bp.length);
      bp.forEach(function(p, pi) {
        p = p.trim(); if (!p) return;
        bene.push({ name: p, quota: pi === bp.length - 1 ? 100 - eachQuota * (bp.length - 1) : eachQuota });
      });
    }
    /* 保单对象 */
    var annPremium = _wizNum(_wizLookupColumn(row, '年缴保费（元）'));
    var sumIns = _wizNum(_wizLookupColumn(row, '保额（元）'));
    var effDate = _wizNormalizeDate(_wizLookupColumn(row, '生效日'));
    var policy = {
      policyCode: (_wizLookupColumn(row, '保单代码') || '').toString().trim(),
      insuranceName: (_wizLookupColumn(row, '险种名称') || '').toString().trim(),
      codeType: (_wizLookupColumn(row, '险种代码') || '').toString().trim(),
      mainType: (_wizLookupColumn(row, '主险/附加险') || '主险').toString().trim() || '主险',
      parentPolicyCode: (_wizLookupColumn(row, '关联主险代码') || '').toString().trim(),
      status: (_wizLookupColumn(row, '保单状态') || '有效').toString().trim() || '有效',
      effectiveDate: effDate,
      paymentMethod: (_wizLookupColumn(row, '缴费方式') || '年缴').toString().trim() || '年缴',
      annualPremium: annPremium,
      sumInsured: sumIns,
      paymentTerm: (_wizLookupColumn(row, '缴费期限（年）') || '').toString().trim(),
      paymentBank: (_wizLookupColumn(row, '缴费银行') || '').toString().trim(),
      paymentBankCard: (_wizLookupColumn(row, '银行卡后四位') || '').toString().trim(),
      insured: (_wizLookupColumn(row, '被保险人') || '').toString().trim(),
      insuredRelation: (_wizLookupColumn(row, '与被保人关系') || '').toString().trim(),
      insuredId: (_wizLookupColumn(row, '被保人身份证') || '').toString().trim(),
      insuredPhone: (_wizLookupColumn(row, '被保人手机号码') || '').toString().trim(),
      beneficiaries: bene,
      remark: (_wizLookupColumn(row, '备注') || '').toString().trim(),
      extraFields: {},
      serviceRecords: []
    };
    groupMap[gKey].policies.push(policy);
    _wiz.totalPolicies++;
  });
  _wiz.clients = groupKeys.map(function(k) { return groupMap[k]; });
  /* StepB: 每条记录做现有数据匹配 */
  _wiz.matchedMap = _wiz.clients.map(function(c) { return _wizFindExistingClient(c); });
  var newCount = 0, mergeCount = 0;
  _wiz.matchedMap.forEach(function(m) { if (m.idx === -1) newCount++; else mergeCount++; });
  _wiz.stats.newClients = newCount;
  _wiz.stats.mergeClients = mergeCount;
}

function _wizRenderStats() {
  document.getElementById('wizS1').textContent = _wiz.clients.length;
  document.getElementById('wizS2').textContent = _wiz.stats.newClients;
  document.getElementById('wizS3').textContent = _wiz.stats.mergeClients;
  document.getElementById('wizS4').textContent = clientData.length || '0';
  document.getElementById('wizS5').textContent = _wiz.totalPolicies;
  document.getElementById('wizS6').textContent = _wiz.badIdCardCount;

  /* 合并详情 */
  var detailHtml = '';
  var shown = 0;
  for (var i = 0; i < _wiz.clients.length && shown < 30; i++) {
    var c = _wiz.clients[i];
    var m = _wiz.matchedMap[i];
    var color = m.idx === -1 ? '#166534' : '#a16207';
    var label = m.idx === -1 ? '（新增）' : '→ 合并到系统中「' + (clientData[m.idx]?.name || '') + '」：' + m.reason;
    detailHtml += '<div style="padding:3px 0;border-bottom:1px dashed #e2e8f0;"><b style="color:' + color + ';">' +
      (c.name || '无名氏') + '</b> · ' + (c.phone || '无电话') + ' · 保单 ' + c.policies.length + ' 份 <span style="color:#64748b;">' +
      label + '</span></div>';
    shown++;
  }
  if (_wiz.clients.length > shown) detailHtml += '<div style="color:#64748b;padding-top:4px;">... 另有 ' + (_wiz.clients.length - shown) + ' 条客户记录省略显示</div>';
  document.getElementById('wizMergeDetail').innerHTML = detailHtml || '<div style="color:#94a3b8;padding:10px;text-align:center;">暂无数据</div>';
  document.getElementById('wizLegend').style.display = 'flex';
}

/* 确认导入执行 */
function wizConfirmImport() {
  var strategy = (document.querySelector('input[name="wizStrategy"]:checked') || {}).value || 'merge';
  var willCount = _wiz.clients.length;
  if (willCount === 0) { showToast('没有可导入的客户数据', 'warning'); return; }

  var doImport = function() {
    try {
      if (strategy === 'overwrite') {
        /* 覆盖模式：完全替换 */
        clientData = _wiz.clients.slice();
      } else if (strategy === 'appendonly') {
        /* 仅追加新客户：idx === -1 的才加 */
        _wiz.clients.forEach(function(c, i) {
          if (_wiz.matchedMap[i].idx === -1) clientData.push(c);
        });
      } else {
        /* merge智能合并：已存在则追加保单（保单号去重），否则新建 */
        _wiz.clients.forEach(function(c, i) {
          var m = _wiz.matchedMap[i];
          if (m.idx === -1) {
            clientData.push(c);
          } else {
            var ex = clientData[m.idx];
            /* 补齐客户空白字段（优先保留旧数据） */
            if (!ex.idCard && c.idCard) ex.idCard = c.idCard;
            if (!ex.phone && c.phone) ex.phone = c.phone;
            if (!ex.address && c.address) ex.address = c.address;
            if (!ex.workCompany && c.workCompany) ex.workCompany = c.workCompany;
            if (!ex.workAddress && c.workAddress) ex.workAddress = c.workAddress;
            /* 保单去重：保单号一致就覆盖，否则追加 */
            c.policies.forEach(function(np) {
              if (!np.policyCode) { ex.policies.push(np); return; }
              var fIdx = -1;
              ex.policies.forEach(function(ep, k) { if (ep.policyCode === np.policyCode) fIdx = k; });
              if (fIdx === -1) ex.policies.push(np);
              else {
                /* 非空字段覆盖旧保单 */
                for (var k in np) if (np[k] !== undefined && np[k] !== '' && np[k] !== null) ex.policies[fIdx][k] = np[k];
              }
            });
          }
        });
      }
      savePolicyData();
      refreshCurrentTab();
      updateBottomStats();
      autoSyncPush();
      closeModal('importWizardModal');
      var msgMap = {
        overwrite: '✅ 覆盖导入完成：共 ' + willCount + ' 位客户，' + _wiz.totalPolicies + ' 份保单',
        appendonly: '✅ 增量导入完成：新增 ' + _wiz.stats.newClients + ' 位客户',
        merge: '✅ 智能合并完成：新增 ' + _wiz.stats.newClients + ' 位，更新 ' + _wiz.stats.mergeClients + ' 位客户保单'
      };
      showToast(msgMap[strategy], 'success');
    } catch(err) {
      showToast('导入失败：' + err.message, 'error');
    }
  };

  if (strategy === 'overwrite') {
    showConfirm('⚠ 您选择了【覆盖导入】！将删除当前系统中所有 ' + clientData.length + ' 位客户数据。强烈建议先点击"导出数据(JSON)"备份。确认继续？', function() { doImport(); });
  } else {
    doImport();
  }
}

/* 导出客户为Word文档 */
function exportClientToWord(idx) {
  var c = clientData[idx];
  if (!c) { showToast('客户数据不存在', 'error'); return; }

  /* 构建Word文档的HTML内容 */
  var htmlContent = '<html xmlns:o="urn:schemas-microsoft-com:office:office" ' +
    'xmlns:w="urn:schemas-microsoft-com:office:word" ' +
    'xmlns="http://www.w3.org/TR/REC-html40">' +
    '<head><meta charset="utf-8">' +
    '<style>' +
    'body { font-family: "微软雅黑", "SimSun", Arial, sans-serif; font-size: 12pt; margin: 40px; }' +
    'h1 { font-size: 18pt; color: #1e40af; border-bottom: 2px solid #1e40af; padding-bottom: 8px; }' +
    'h2 { font-size: 14pt; color: #1e40af; margin-top: 20px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }' +
    'h3 { font-size: 12pt; color: #334155; margin-top: 12px; }' +
    'table { border-collapse: collapse; width: 100%; margin: 8px 0; }' +
    'th, td { border: 1px solid #94a3b8; padding: 6px 10px; font-size: 11pt; text-align: left; }' +
    'th { background: #f1f5f9; font-weight: bold; }' +
    '.tag-valid { color: #166534; }' +
    '.tag-invalid { color: #991b1b; }' +
    '.total-box { background: #f0f7ff; padding: 10px; margin: 12px 0; border-radius: 4px; border-left: 4px solid #3b82f6; }' +
    '.footer { margin-top: 30px; font-size: 10pt; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 8px; }' +
    '</style></head><body>';

  /* 标题 */
  htmlContent += '<h1>保单信息汇总</h1>';

  /* 安全提示 */
  htmlContent += '<div style="background:#fff7ed;border:1px solid #fdba74;padding:10px 14px;margin:12px 0;border-radius:4px;font-size:10pt;color:#92400e;">';
  htmlContent += '<strong>重要提示：</strong>本文档包含个人敏感信息，请妥善保管，勿随意外传。文档中的身份证号和手机号已做脱敏处理。';
  htmlContent += '</div>';

  /* 投保人基本信息 */
  htmlContent += '<h2>一、投保人信息</h2>';
  htmlContent += '<table>';
  htmlContent += '<tr><th style="width:120px;">投保人姓名</th><td>' + (c.name || '-') + '</td></tr>';
  htmlContent += '<tr><th>身份证号</th><td>' + maskIdCard(c.idCard) + '</td></tr>';
  htmlContent += '<tr><th>联系电话</th><td>' + maskPhone(c.phone) + '</td></tr>';
  htmlContent += '<tr><th>通信地址</th><td>' + (c.address || '-') + '</td></tr>';
  if (c.workCompany) htmlContent += '<tr><th>工作单位</th><td>' + c.workCompany + '</td></tr>';
  if (c.workAddress) htmlContent += '<tr><th>工作地址</th><td>' + c.workAddress + '</td></tr>';
  htmlContent += '</table>';

  /* 家庭成员 */
  var sectionIdx = 1;
  if (c.familyMembers && c.familyMembers.length > 0) {
    sectionIdx++;
    htmlContent += '<h2>二、家庭成员</h2>';
    htmlContent += '<table><tr><th>姓名</th><th>关系</th><th>身份证号</th><th>电话</th><th>备注</th></tr>';
    c.familyMembers.forEach(function(fm) {
      htmlContent += '<tr><td>' + (fm.name || '') + '</td><td>' + (fm.relationship || '') + '</td><td>' + maskIdCard(fm.idCard) + '</td><td>' + maskPhone(fm.phone) + '</td><td>' + (fm.note || '') + '</td></tr>';
    });
    htmlContent += '</table>';
  }

  /* 保单信息 */
  var policies = c.policies || [];
  if (policies.length > 0) {
    sectionIdx++;
    var cnNum = ['一','二','三','四','五'];
    htmlContent += '<h2>' + (cnNum[sectionIdx - 1] || sectionIdx) + '、保单明细</h2>';

    /* 汇总统计 */
    var totalPremium = 0;
    var validCount = 0;
    policies.forEach(function(p) {
      totalPremium += parseFloat(p.annualPremium) || 0;
      if (p.status === '有效') validCount++;
    });
    htmlContent += '<div class="total-box">';
    htmlContent += '<b>保单统计：</b>共 ' + policies.length + ' 份保单，其中有效 ' + validCount + ' 份，失效 ' + (policies.length - validCount) + ' 份；年缴保费合计 ' + totalPremium.toFixed(2) + ' 元';
    htmlContent += '</div>';

    /* 逐份保单详情 */
    policies.forEach(function(p, i) {
      htmlContent += '<h3>保单 ' + (i + 1) + (p.mainType === '附加险' ? '（附加险）' : '') + '</h3>';
      htmlContent += '<table>';
      htmlContent += '<tr><th style="width:120px;">保单代码</th><td>' + (p.policyCode || '-') + '</td><th style="width:120px;">险种代码</th><td>' + (p.codeType || '-') + '</td></tr>';
      htmlContent += '<tr><th>险种名称</th><td colspan="3">' + (p.insuranceName || '-') + '</td></tr>';
      htmlContent += '<tr><th>保单状态</th><td class="' + (p.status === '有效' ? 'tag-valid' : 'tag-invalid') + '"><b>' + (p.status || '-') + '</b></td><th>险种类型</th><td>' + (p.mainType || '主险') + '</td></tr>';
      if (p.parentPolicyCode) {
        htmlContent += '<tr><th>关联主险</th><td colspan="3">' + p.parentPolicyCode + '</td></tr>';
      }
      htmlContent += '<tr><th>生效日期</th><td>' + formatDate(p.effectiveDate) + '</td><th>缴费方式</th><td>' + (p.paymentMethod || '-') + '</td></tr>';
      htmlContent += '<tr><th>年缴保费</th><td><b>' + formatMoney(p.annualPremium) + ' 元</b></td><th>缴费期限</th><td>' + (p.paymentTerm ? p.paymentTerm + ' 年' : '-') + '</td></tr>';
      /* 缴费银行：仅当缴费期内显示 */
      if (p.paymentBank && p.paymentBankCard && p.effectiveDate && p.paymentTerm) {
        var effY = parseInt(p.effectiveDate.substring(0,4));
        var md = p.effectiveDate.substring(4,8);
        var endStr = (effY + parseInt(p.paymentTerm)) + md;
        var today = new Date();
        var todayStr = today.getFullYear() + String(today.getMonth()+1).padStart(2,'0') + String(today.getDate()).padStart(2,'0');
        if (todayStr <= endStr) {
          htmlContent += '<tr><th>缴费银行</th><td>' + p.paymentBank + '（尾号' + p.paymentBankCard + '）</td><th></th><td></td></tr>';
        }
      }
      if (p.sumInsured) {
        htmlContent += '<tr><th>保额</th><td colspan="3"><b>' + formatMoney(p.sumInsured) + ' 元</b></td></tr>';
      }
      htmlContent += '<tr><th>被保险人</th><td>' + (p.insured || '-') + '</td><th>与被保人关系</th><td>' + (p.insuredRelation || '-') + '</td></tr>';
      htmlContent += '<tr><th>被保人身份证</th><td>' + maskIdCard(p.insuredId) + '</td><th>被保人手机</th><td>' + maskPhone(p.insuredPhone) + '</td></tr>';
      /* 受益人 */
      if (p.beneficiaries && p.beneficiaries.length > 0) {
        var beneNames = p.beneficiaries.map(function(b) { return b.name + '(' + b.quota + '%)'; }).join('、');
        htmlContent += '<tr><th>受益人</th><td colspan="3">' + beneNames + '</td></tr>';
      }
      if (p.remark) {
        htmlContent += '<tr><th>备注</th><td colspan="3">' + p.remark + '</td></tr>';
      }
      htmlContent += '</table>';
    });
  }

  /* 联系记录 */
  if (c.contactHistory && c.contactHistory.length > 0) {
    sectionIdx++;
    var cnNum = ['一','二','三','四','五'];
    htmlContent += '<h2>' + (cnNum[sectionIdx - 1] || sectionIdx) + '、联系记录</h2>';
    htmlContent += '<table><tr><th>日期</th><th>状态</th><th>备注</th></tr>';
    c.contactHistory.forEach(function(ch) {
      htmlContent += '<tr><td>' + formatDate(ch.date) + '</td><td>' + (ch.status || '') + '</td><td>' + (ch.note || '') + '</td></tr>';
    });
    htmlContent += '</table>';
  }

  /* 页脚 */
  htmlContent += '<div class="footer">';
  htmlContent += '此文档由保单管理系统自动生成 | 导出时间：' + new Date().toLocaleString('zh-CN');
  htmlContent += '</div>';
  htmlContent += '</body></html>';

  /* 生成并下载docx文件 */
  var blob = new Blob(['\ufeff' + htmlContent], { type: 'application/msword' });
  var fileName = (c.name || '客户') + '_保单信息.doc';
  saveAs(blob, fileName);
  showToast('Word文档已导出：' + fileName, 'success');
}

