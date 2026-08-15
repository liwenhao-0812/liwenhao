/* ======== 工具函数 ======== */

/* 简单hash（用于密码存储） */
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return 'H' + Math.abs(hash).toString(36);
}

/* 生成唯一ID */
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
}

/* 日期格式化 */
function formatDate(dateStr) {
  if (!dateStr) return '';
  if (dateStr.length === 8 && /^\d{8}$/.test(dateStr)) {
    return dateStr.substr(0, 4) + '-' + dateStr.substr(4, 2) + '-' + dateStr.substr(6, 2);
  }
  return dateStr;
}

/* 日期转YYYYMMDD */
function toYMD(dateStr) {
  if (!dateStr) return '';
  return dateStr.replace(/-/g, '');
}

/* 格式化金额 */
function formatMoney(val) {
  if (!val && val !== 0) return '0';
  return parseFloat(val).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* 从身份证号提取出生日期并计算年龄 */
function calcAgeFromIdCard(idCard, referenceDateStr) {
  if (!idCard) return null;
  var s = String(idCard);
  if (s.length < 14) return null;
  /* 提取出生年月日 */
  var birthYear = parseInt(s.substring(6, 10));
  var birthMonth = parseInt(s.substring(10, 12));
  var birthDay = parseInt(s.substring(12, 14));
  if (isNaN(birthYear) || isNaN(birthMonth) || isNaN(birthDay)) return null;

  /* 参考日期 */
  var refDate;
  if (referenceDateStr && referenceDateStr.length >= 8) {
    var ry = parseInt(referenceDateStr.substring(0, 4));
    var rm = parseInt(referenceDateStr.substring(4, 6));
    var rd = parseInt(referenceDateStr.substring(6, 8));
    refDate = new Date(ry, rm - 1, rd);
  } else {
    refDate = new Date();
  }
  refDate.setHours(0, 0, 0, 0);

  var birthDate = new Date(birthYear, birthMonth - 1, birthDay);
  var age = refDate.getFullYear() - birthDate.getFullYear();

  /* 判断是否已过生日 */
  var refMonth = refDate.getMonth();
  var refDay = refDate.getDate();
  if (refMonth < birthMonth - 1 || (refMonth === birthMonth - 1 && refDay < birthDay)) {
    age--;
  }
  return age;
}

/* 敏感信息脱敏 */
function maskIdCard(id) {
  if (!id) return '-';
  var s = String(id);
  if (s.length >= 15) return s.substring(0, 4) + '****' + s.substring(s.length - 4);
  return s.substring(0, 2) + '****' + s.substring(s.length - 2);
}
function maskPhone(phone) {
  if (!phone) return '-';
  var s = String(phone);
  if (s.length >= 11) return s.substring(0, 3) + '****' + s.substring(s.length - 4);
  return s.substring(0, 3) + '****';
}
/* 显示/隐藏敏感信息切换 */
var showSensitiveData = true;
function toggleSensitiveData() {
  showSensitiveData = !showSensitiveData;
  showToast(showSensitiveData ? '敏感信息已显示' : '敏感信息已隐藏', 'warning');
  refreshCurrentTab();
}

/* ======== 数据加密存储 ======== */
var ENC_SALT = 'PMSecureVault_2024_X7k9';
function _deriveKey(keyHint) {
  /* 从用户名+盐值派生加密密钥 */
  var raw = keyHint + ENC_SALT;
  var hash = 0;
  for (var i = 0; i < raw.length; i++) {
    var ch = raw.charCodeAt(i);
    hash = ((hash << 5) - hash) + ch;
    hash |= 0;
  }
  /* 生成16字节密钥 */
  var key = [];
  var seed = Math.abs(hash);
  for (var i = 0; i < 16; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    key.push(seed % 256);
  }
  return key;
}
function secureSetItem(key, value, keyHint) {
  try {
    var hint = keyHint || currentUser;
    var keyBytes = _deriveKey(hint);
    var valStr = JSON.stringify(value);
    var encBytes = [];
    for (var i = 0; i < valStr.length; i++) {
      encBytes.push(valStr.charCodeAt(i) ^ keyBytes[i % 16]);
    }
    /* 转为Base64存储 */
    var binary = '';
    for (var i = 0; i < encBytes.length; i++) {
      binary += String.fromCharCode(encBytes[i]);
    }
    localStorage.setItem(key, btoa(binary));
  } catch(e) {
    /* 降级：加密失败时明文存储 */
    localStorage.setItem(key, JSON.stringify(value));
  }
}
function secureGetItem(key, keyHint) {
  try {
    var stored = localStorage.getItem(key);
    if (!stored) return null;
    /* 尝试解密 */
    var binary = atob(stored);
    var hint = keyHint || currentUser;
    var keyBytes = _deriveKey(hint);
    var decBytes = [];
    for (var i = 0; i < binary.length; i++) {
      decBytes.push(binary.charCodeAt(i) ^ keyBytes[i % 16]);
    }
    var decStr = '';
    for (var i = 0; i < decBytes.length; i++) {
      decStr += String.fromCharCode(decBytes[i]);
    }
    return JSON.parse(decStr);
  } catch(e) {
    /* 可能是旧版明文数据，尝试直接解析 */
    try {
      return JSON.parse(stored);
    } catch(e2) {
      return null;
    }
  }
}

/* Toast提示 */
function showToast(msg, type) {
  type = type || 'info';
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = 'toast ' + type;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(function() { toast.remove(); }, 3000);
}

/* 打开/关闭模态框 */
function openModal(id) {
  document.getElementById(id).classList.add('show');
}
function closeModal(id) {
  document.getElementById(id).classList.remove('show');
}

/* 显示确认框 */
function showConfirm(msg, callback) {
  document.getElementById('confirmMessage').textContent = msg;
  confirmCallback = callback;
  document.getElementById('confirmBtn').onclick = function() {
    closeModal('confirmModal');
    if (confirmCallback) confirmCallback();
  };
  openModal('confirmModal');
}

