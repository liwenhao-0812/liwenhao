/* ======== 用户系统 ======== */

/* 获取所有用户列表 */
function getUsers() {
  try {
    return JSON.parse(localStorage.getItem('pms_users') || '[]');
  } catch(e) { return []; }
}

/* 保存用户列表 */
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

/* 处理登录 */
function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginError');

  if (!username || !password) {
    errEl.textContent = '请填写用户名和密码';
    return;
  }

  const users = getUsers();
  const user = users.find(function(u) { return u.username === username; });
  if (!user) {
    /* 本地无此用户，尝试从云端验证 */
    errEl.textContent = '正在云端验证...';
    tryLoginFromCloud(username, password, errEl);
    return;
  }
  if (user.passwordHash !== simpleHash(password)) {
    errEl.textContent = '密码错误';
    return;
  }

  /* 登录成功 */
  finishLogin(username, user, errEl);
}

/* 从云端验证登录（跨浏览器支持） */
function tryLoginFromCloud(username, password, errEl) {
  if (!hasGitHubToken()) { /* 未配置Token，无法云端验证 */
    errEl.textContent = '用户不存在，请先注册。如需跨设备同步，请在设置页配置GitHub Token。';
    return;
  }
  var fileName = '保单数据_' + username + '.json';
  fetch('https://api.github.com/repos/' + GITHUB_OWNER + '/' + GITHUB_REPO + '/contents/' + encodeURIComponent(fileName) + '?ref=' + GITHUB_BRANCH, {
    headers: { 'Authorization': 'token ' + getGitHubToken() },
    cache: 'no-store'
  })
  .then(function(r) {
    if (r.status === 404) throw new Error('用户不存在');
    if (!r.ok) throw new Error('网络错误');
    return r.json();
  })
  .then(function(fileInfo) {
    var jsonStr = decodeURIComponent(escape(atob(fileInfo.content.replace(/\s/g, ''))));
    var cloudData = JSON.parse(jsonStr);
    var cloudHash = cloudData._passwordHash || '';
    if (!cloudHash) {
      errEl.textContent = '云端数据无密码记录，请先在当前浏览器注册后从云端恢复';
      return;
    }
    if (cloudHash !== simpleHash(password)) {
      errEl.textContent = '密码错误';
      return;
    }
    /* 云端验证通过，本地创建账号并恢复数据 */
    var users = getUsers();
    var newUser = {
      username: username,
      passwordHash: cloudHash,
      createdAt: new Date().toISOString(),
      lastLogin: new Date().toISOString()
    };
    users.push(newUser);
    saveUsers(users);
    /* 先设置 currentUser，否则 restore 和 sync 会存到错误的 key（如 insurance_type_lib_null） */
    currentUser = username;
    /* 恢复云端数据 */
    restoreFromCloudData(cloudData);
    syncExistingPoliciesToLib();
    finishLogin(username, newUser, errEl);
  })
  .catch(function(e) {
    errEl.textContent = e.message === '用户不存在' ? '用户不存在' : '云端验证失败，请检查网络';
  });
}

/* 完成登录流程 */
function finishLogin(username, user, errEl) {
  user.lastLogin = new Date().toISOString();
  saveUsers(getUsers());
  currentUser = username;
  localStorage.setItem('pms_currentUser', username);
  errEl.textContent = '';
  enterMainApp();
}

/* 处理注册 */
function handleRegister(e) {
  e.preventDefault();
  const username = document.getElementById('regUsername').value.trim();
  const password = document.getElementById('regPassword').value;
  const confirm = document.getElementById('regPasswordConfirm').value;
  const errEl = document.getElementById('regError');

  if (!username || !password || !confirm) {
    errEl.textContent = '请填写所有字段';
    return;
  }
  if (password.length < 6) {
    errEl.textContent = '密码长度至少6位';
    return;
  }
  if (password !== confirm) {
    errEl.textContent = '两次密码不一致';
    return;
  }

  const users = getUsers();
  if (users.find(function(u) { return u.username === username; })) {
    errEl.textContent = '用户名已存在';
    return;
  }

  users.push({
    username: username,
    passwordHash: simpleHash(password),
    createdAt: new Date().toISOString(),
    lastLogin: new Date().toISOString()
  });
  saveUsers(users);

  errEl.textContent = '';
  showToast('注册成功，请登录', 'success');
  switchAuthTab('login');
  document.getElementById('loginUsername').value = username;
}

/* 退出登录 */
function handleLogout() {
  currentUser = null;
  localStorage.removeItem('pms_currentUser');
  clientData = [];
  var mApp = document.getElementById('mainApp');
  var aPage = document.getElementById('authPage');
  if (mApp) mApp.style.display = 'none';
  if (aPage) aPage.style.display = 'flex';
  var lu = document.getElementById('loginUsername');
  var lp = document.getElementById('loginPassword');
  var le = document.getElementById('loginError');
  if (lu) lu.value = '';
  if (lp) lp.value = '';
  if (le) le.textContent = '';
}

/* 进入主界面 */
function enterMainApp() {
  var authPage = document.getElementById('authPage');
  var mainApp = document.getElementById('mainApp');
  var userNameEl = document.getElementById('currentUserName');
  /* 防御：DOM未就绪时延迟再执行 */
  if (!authPage || !mainApp || !userNameEl) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', enterMainApp, { once: true });
      return;
    }
  }
  if (authPage) authPage.style.display = 'none';
  if (mainApp) mainApp.style.display = 'block';
  if (userNameEl) userNameEl.textContent = currentUser;

  /* 初始化 Supabase */
  initSupabase();

  /* 加载数据（异步） */
  loadUserData().then(function() {
    updateSettingSyncStatus(hasGitHubToken());
    /* 如果本地没有数据，自动从云端拉取 */
    if (clientData.length === 0) {
      autoPullFromCloud();
    }
    syncExistingPoliciesToLib();
    updateInsuranceTypeDatalist();
    switchTab('home');
    updateBottomStats();
  });
}

