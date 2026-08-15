/* ======== 用户系统（Supabase Auth：邮箱+密码）======== */

/* 旧版本地用户：为了向后兼容，保留读取函数，不再新增。
   新用户一律走 Supabase Auth。*/
function getUsers() {
  try {
    return JSON.parse(localStorage.getItem('pms_users') || '[]');
  } catch(e) { return []; }
}
function saveUsers(users) {
  localStorage.setItem('pms_users', JSON.stringify(users));
}

/* 切换登录/注册Tab */
function switchAuthTab(tab) {
  const tabs = document.querySelectorAll('.auth-tab');
  if (!tabs || tabs.length < 2) return;
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  tabs.forEach(function(t) { t.classList.remove('active'); });
  if (tab === 'login') {
    tabs[0].classList.add('active');
    if (loginForm) loginForm.classList.remove('hidden');
    if (registerForm) registerForm.classList.add('hidden');
  } else {
    if (tabs.length > 1) tabs[1].classList.add('active');
    if (loginForm) loginForm.classList.add('hidden');
    if (registerForm) registerForm.classList.remove('hidden');
  }
}

/* 解析 Supabase 错误给人看 */
function sbFriendlyError(status, data) {
  if (status === 400) {
    var msg = (data && data.msg) || (data && data.error_description) || (data && data.message) || '';
    if (msg.toLowerCase().includes('email')) return '邮箱格式不正确或已被注册';
    if (msg.toLowerCase().includes('password')) return '密码太短（至少6位）';
    if (msg.toLowerCase().includes('already registered')) return '该邮箱已注册，请直接登录';
    if (msg) return msg.substring(0, 80);
    return '参数错误，请检查邮箱格式';
  }
  if (status === 401) return '邮箱或密码错误';
  if (status === 422) return '邮箱格式不正确';
  if (status === 429) return '请求过于频繁，请稍后再试';
  if (status === 500 || status >= 500) return '服务异常，请稍后再试';
  if (data && (data.error_description || data.message || data.msg)) {
    return (data.error_description || data.message || data.msg).substring(0, 80);
  }
  return '网络异常，请稍后重试';
}

/* 把旧 localStorage key（按 username 后缀）迁移到按 user_id 后缀 */
function migrateLocalStorageIfNeeded(oldUsernameHint) {
  if (!currentUserId) return;
  var srcUser = oldUsernameHint || currentUser;
  var keys = ['policy_data_', 'insurance_type_lib_', 'policy_data__timestamp_'];
  keys.forEach(function(prefix) {
    var srcKey = prefix + (srcUser || '');
    var dstKey = prefix + currentUserId;
    if (localStorage.getItem(dstKey) !== null) return; /* 已有不覆盖 */
    /* 新版 secureSetItem 加了 _suffix 后缀：见 secureSetItem 实现 */
    var encodedSrc = localStorage.getItem(srcUser ? (prefix + srcUser + '_' + (prefix.startsWith('insurance') ? 'insurance_type_lib' : 'policy_data')) : '');
    if (encodedSrc) {
      localStorage.setItem(prefix + currentUserId + '_' + (prefix.startsWith('insurance') ? 'insurance_type_lib' : 'policy_data'), encodedSrc);
    }
  });
}

/* ======== 登录：邮箱 + 密码 ======== */
async function handleLogin(e) {
  e.preventDefault();
  var emailEl = document.getElementById('loginEmail');
  var passEl = document.getElementById('loginPassword');
  var errEl = document.getElementById('loginError');
  var email = emailEl.value.trim().toLowerCase();
  var password = passEl.value;
  if (!email || !password) { errEl.textContent = '请填写邮箱和密码'; return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { errEl.textContent = '邮箱格式不正确'; return; }
  errEl.textContent = '正在登录...';
  try {
    var r = await sbAuthSignIn(email, password);
    if (!r.ok) {
      errEl.textContent = sbFriendlyError(r.status, r.data);
      return;
    }
    var s = r.data;
    /* Supabase 如果要求邮箱确认但用户没点确认链接，access_token 可能为空 */
    if (!s.access_token) {
      if (r.data && r.data.msg && r.data.msg.toLowerCase().includes('verify')) {
        errEl.textContent = '邮箱尚未验证，请先到邮箱里点击验证链接';
      } else {
        errEl.textContent = '登录失败：服务端未返回会话';
      }
      return;
    }
    saveSession(s);
    errEl.textContent = '';
    showToast('登录成功', 'success');
    finishLogin();
  } catch (e) {
    errEl.textContent = '网络异常：' + (e.message || '请稍后再试');
  }
}

/* ======== 注册：显示名称 + 邮箱 + 密码 ======== */
async function handleRegister(e) {
  e.preventDefault();
  var nameEl = document.getElementById('regName');
  var emailEl = document.getElementById('regEmail');
  var passEl = document.getElementById('regPassword');
  var confirmEl = document.getElementById('regPasswordConfirm');
  var errEl = document.getElementById('regError');
  var name = nameEl.value.trim();
  var email = emailEl.value.trim().toLowerCase();
  var password = passEl.value;
  var confirm = confirmEl.value;
  if (!name || !email || !password || !confirm) { errEl.textContent = '请填写所有字段'; return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { errEl.textContent = '邮箱格式不正确'; return; }
  if (password.length < 6) { errEl.textContent = '密码长度至少6位'; return; }
  if (password !== confirm) { errEl.textContent = '两次密码不一致'; return; }
  errEl.textContent = '正在注册...';
  try {
    var r = await sbAuthSignUp(email, password, name);
    if (!r.ok) {
      errEl.textContent = sbFriendlyError(r.status, r.data);
      return;
    }
    /* 两种情况：
       a) 项目里 Email Provider 关闭了 Confirm email：signUp 直接返回 access_token → 自动登录
       b) 开启了邮箱确认：返回空 user，提示去邮箱点链接 */
    if (r.data && r.data.access_token) {
      saveSession(r.data);
      errEl.textContent = '';
      showToast('注册成功，正在进入系统...', 'success');
      finishLogin();
      return;
    }
    /* 需邮箱确认 */
    errEl.innerHTML = '<span style="color:#059669;">注册成功！</span> 请到 <strong>' + email + '</strong> 的收件箱点击验证链接，验证后即可登录。';
    showToast('注册成功，请验证邮箱后登录', 'success');
    /* 3秒后自动切到登录 Tab */
    setTimeout(function() {
      switchAuthTab('login');
      var le = document.getElementById('loginEmail');
      if (le) le.value = email;
    }, 2500);
  } catch (e) {
    errEl.textContent = '网络异常：' + (e.message || '请稍后再试');
  }
}

/* ======== 登录成功 → 进入主界面 ======== */
function finishLogin() {
  /* 老数据迁移：如果用户之前用本地方式存过同名（display_name 前缀）的数据，迁移过来 */
  migrateLocalStorageIfNeeded();
  enterMainApp();
}

/* ======== 退出登录 ======== */
async function handleLogout() {
  try { await sbAuthSignOut(); } catch(e) {}
  clearSession();
  clientData = [];
  var mApp = document.getElementById('mainApp');
  var aPage = document.getElementById('authPage');
  if (mApp) mApp.style.display = 'none';
  if (aPage) aPage.style.display = 'flex';
  var le = document.getElementById('loginEmail');
  var lp = document.getElementById('loginPassword');
  var err = document.getElementById('loginError');
  if (le) le.value = '';
  if (lp) lp.value = '';
  if (err) err.textContent = '';
}

/* 进入主界面 */
function enterMainApp() {
  var authPage = document.getElementById('authPage');
  var mainApp = document.getElementById('mainApp');
  var userNameEl = document.getElementById('currentUserName');
  if (!authPage || !mainApp || !userNameEl) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', enterMainApp, { once: true });
      return;
    }
  }
  if (authPage) authPage.style.display = 'none';
  if (mainApp) mainApp.style.display = 'block';
  if (userNameEl) userNameEl.textContent = currentUser; /* 显示名称（display_name 或邮箱前缀） */

  initSupabase();

  loadUserData().then(function() {
    updateSettingSyncStatus(hasGitHubToken());
    if (clientData.length === 0) autoPullFromCloud();
    syncExistingPoliciesToLib();
    updateInsuranceTypeDatalist();
    switchTab('home');
    updateBottomStats();
  });
}

/* 旧系统兼容函数：08-app.js 初始化可能还会调用 initAdmin / tryLoginFromCloud */
function initAdmin() { /* 不需要再建本地默认用户，Supabase Auth 接管 */ }
function tryLoginFromCloud() {}
