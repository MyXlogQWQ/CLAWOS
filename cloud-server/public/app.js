const $ = (id) => document.getElementById(id);

const state = {
  token: localStorage.getItem('clawos_token') || '',
  deviceId: localStorage.getItem('clawos_device_id') || '',
  sessionId: localStorage.getItem('clawos_session_id') || '',
};

function syncStateToUi() {
  $('tokenInfo').textContent = state.token ? `${state.token.slice(0, 12)}...` : '(空)';
  $('deviceInfo').textContent = state.deviceId || '(空)';
  $('sessionInfo').textContent = state.sessionId || '(空)';
  $('deviceId').value = state.deviceId;
  $('sessionId').value = state.sessionId;
}

function saveState() {
  localStorage.setItem('clawos_token', state.token || '');
  localStorage.setItem('clawos_device_id', state.deviceId || '');
  localStorage.setItem('clawos_session_id', state.sessionId || '');
  syncStateToUi();
}

function log(title, data) {
  const ts = new Date().toLocaleString();
  const text = `[${ts}] ${title}\n${JSON.stringify(data, null, 2)}\n\n`;
  $('log').textContent = text + $('log').textContent;
}

async function callApi(method, url, body, auth = false) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && state.token) headers.Authorization = `Bearer ${state.token}`;
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data;
  try {
    data = await res.json();
  } catch {
    data = { raw: await res.text() };
  }
  if (!res.ok) {
    throw { status: res.status, data };
  }
  return data;
}

async function onHealth() {
  try {
    const data = await callApi('GET', '/health');
    $('healthStatus').textContent = `在线 (${data.timestamp})`;
    log('GET /health', data);
  } catch (err) {
    $('healthStatus').textContent = '离线';
    log('GET /health ERROR', err);
  }
}

async function onRegister() {
  const body = {
    email: $('email').value.trim(),
    password: $('password').value,
    nickname: $('nickname').value.trim() || undefined,
  };
  const data = await callApi('POST', '/auth/register', body);
  log('POST /auth/register', data);
}

async function onLogin() {
  const body = {
    email: $('email').value.trim(),
    password: $('password').value,
  };
  const data = await callApi('POST', '/auth/login', body);
  state.token = data.access_token;
  saveState();
  log('POST /auth/login', data);
}

async function onBindDevice() {
  const body = {
    device_id: $('deviceId').value.trim() || undefined,
    device_name: $('deviceName').value.trim() || undefined,
  };
  const data = await callApi('POST', '/devices/bind', body, true);
  state.deviceId = data.device.id;
  saveState();
  log('POST /devices/bind', data);
}

async function onCreateSession() {
  const data = await callApi('POST', '/sessions/create', { device_id: $('deviceId').value.trim() || state.deviceId }, true);
  state.sessionId = data.session_id;
  saveState();
  log('POST /sessions/create', data);
}

async function onRelaySend() {
  const body = {
    session_id: $('sessionId').value.trim() || state.sessionId,
    msg_type: $('msgType').value,
    content: $('msgContent').value.trim(),
    nonce: 'BASE64_NONCE',
  };
  const data = await callApi('POST', '/relay/send', body, true);
  log('POST /relay/send', data);
}

async function onRelayPull() {
  const sessionId = $('sessionId').value.trim() || state.sessionId;
  const cursor = $('cursor').value.trim() || '0';
  const data = await callApi('GET', `/relay/pull?session_id=${encodeURIComponent(sessionId)}&cursor=${encodeURIComponent(cursor)}`, null, true);
  if (Array.isArray(data.messages) && data.messages.length) {
    $('cursor').value = String(data.cursor);
  }
  log('GET /relay/pull', data);
}

async function onCreateShare() {
  const body = {
    device_id: $('deviceId').value.trim() || state.deviceId,
    expires_in_minutes: Number($('shareExpire').value || 30),
  };
  const data = await callApi('POST', '/share/create', body, true);
  $('shareCode').value = data.share_code || '';
  log('POST /share/create', data);
}

async function onJoinShare() {
  const data = await callApi('POST', '/share/join', { share_code: $('shareCode').value.trim() }, true);
  if (data.device_id) {
    state.deviceId = data.device_id;
    saveState();
  }
  log('POST /share/join', data);
}

async function onFilesList() {
  const deviceId = $('deviceId').value.trim() || state.deviceId;
  const spaceType = $('spaceType').value;
  const data = await callApi('GET', `/files/list?device_id=${encodeURIComponent(deviceId)}&space_type=${encodeURIComponent(spaceType)}`, null, true);
  log('GET /files/list', data);
  if (data.files && data.files.length) {
    $('fileId').value = String(data.files[0].file_id);
  }
}

async function onFilesPreview() {
  const fileId = $('fileId').value.trim();
  const data = await callApi('GET', `/files/preview?file_id=${encodeURIComponent(fileId)}`, null, true);
  log('GET /files/preview', data);
}

function wrap(handler, name) {
  return async () => {
    try {
      await handler();
    } catch (err) {
      log(`${name} ERROR`, err);
    }
  };
}

$('btnHealth').addEventListener('click', wrap(onHealth, 'health'));
$('btnRegister').addEventListener('click', wrap(onRegister, 'register'));
$('btnLogin').addEventListener('click', wrap(onLogin, 'login'));
$('btnBindDevice').addEventListener('click', wrap(onBindDevice, 'bind_device'));
$('btnCreateSession').addEventListener('click', wrap(onCreateSession, 'create_session'));
$('btnRelaySend').addEventListener('click', wrap(onRelaySend, 'relay_send'));
$('btnRelayPull').addEventListener('click', wrap(onRelayPull, 'relay_pull'));
$('btnCreateShare').addEventListener('click', wrap(onCreateShare, 'create_share'));
$('btnJoinShare').addEventListener('click', wrap(onJoinShare, 'join_share'));
$('btnFilesList').addEventListener('click', wrap(onFilesList, 'files_list'));
$('btnFilesPreview').addEventListener('click', wrap(onFilesPreview, 'files_preview'));
$('btnLogout').addEventListener('click', () => {
  state.token = '';
  saveState();
  log('LOGOUT', { ok: true });
});

syncStateToUi();
onHealth();
