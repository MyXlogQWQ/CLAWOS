const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

const PORT = process.env.PORT || 8787;
const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

function nowIso() {
  return new Date().toISOString();
}

function randomId() {
  return crypto.randomUUID();
}

function randomToken(size = 32) {
  return crypto.randomBytes(size).toString('hex');
}

function generateShareCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 10; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

function verifyPassword(password, encoded) {
  const [saltHex, hashHex] = String(encoded || '').split(':');
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, salt, 64);
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

function initDb() {
  if (!fs.existsSync(path.dirname(DB_PATH))) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  }

  if (!fs.existsSync(DB_PATH)) {
    const initial = {
      users: [],
      auth_tokens: [],
      devices: [],
      user_device_roles: [],
      relay_messages: [],
      audit_logs: [],
      share_links: [],
      file_entries: [],
      sequences: {
        relay_messages: 1,
        audit_logs: 1,
        file_entries: 1,
      },
    };
    fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2));
  }
}

function loadDb() {
  initDb();
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function saveDb(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function logAudit(db, { user_id = null, action, target_type, target_id = null, metadata = {} }) {
  const row = {
    id: db.sequences.audit_logs++,
    user_id,
    action,
    target_type,
    target_id,
    metadata,
    created_at: nowIso(),
  };
  db.audit_logs.push(row);
}

function cleanupExpiredTokens(db) {
  const now = Date.now();
  db.auth_tokens = db.auth_tokens.filter((t) => new Date(t.expires_at).getTime() > now);
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return res.status(401).json({ error: 'missing_bearer_token' });

  const db = loadDb();
  cleanupExpiredTokens(db);
  const tokenRow = db.auth_tokens.find((t) => t.token === token);
  if (!tokenRow) {
    saveDb(db);
    return res.status(401).json({ error: 'invalid_or_expired_token' });
  }

  const user = db.users.find((u) => u.id === tokenRow.user_id);
  if (!user) {
    saveDb(db);
    return res.status(401).json({ error: 'user_not_found' });
  }

  req.ctx = { db, user, tokenRow };
  return next();
}

function requireRoleOnDevice(db, userId, deviceId, allowedRoles) {
  const rel = db.user_device_roles.find((r) => r.user_id === userId && r.device_id === deviceId);
  if (!rel) return { ok: false, reason: 'not_bound_to_device' };
  if (!allowedRoles.includes(rel.role)) return { ok: false, reason: 'insufficient_role' };
  return { ok: true, role: rel.role };
}

function findDeviceBySession(db, sessionId) {
  return db.devices.find((d) => d.session_id === sessionId || d.session_link === sessionId);
}

function seedFilesForDevice(db, deviceId, ownerUserId) {
  const exists = db.file_entries.some((f) => f.device_id === deviceId);
  if (exists) return;

  const rows = [
    {
      name: 'shared-readme.txt',
      space_type: 'public',
      privacy_level: 1,
      size: 2048,
      preview_excerpt: null,
    },
    {
      name: 'shared-thumb.png',
      space_type: 'public',
      privacy_level: 2,
      size: 10240,
      preview_excerpt: 'PNG_HEADER_PREVIEW',
    },
    {
      name: 'my-secret-note.txt',
      space_type: 'private',
      privacy_level: 2,
      size: 512,
      preview_excerpt: 'This is encrypted local-only content preview.',
    },
  ];

  rows.forEach((r) => {
    db.file_entries.push({
      id: db.sequences.file_entries++,
      device_id: deviceId,
      owner_user_id: r.space_type === 'private' ? ownerUserId : null,
      name: r.name,
      space_type: r.space_type,
      privacy_level: r.privacy_level,
      size: r.size,
      preview_excerpt: r.preview_excerpt,
      created_at: nowIso(),
    });
  });
}

app.get('/health', (_req, res) => {
  return res.json({ ok: true, service: 'clawos-cloud-server', timestamp: nowIso() });
});

app.get('/', (_req, res) => {
  return res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.post('/auth/register', (req, res) => {
  const { email, password, nickname } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email_and_password_required' });
  if (String(password).length < 8) return res.status(400).json({ error: 'password_too_short' });

  const db = loadDb();
  const normalizedEmail = String(email).trim().toLowerCase();
  if (db.users.some((u) => u.email === normalizedEmail)) {
    return res.status(409).json({ error: 'email_already_exists' });
  }

  const user = {
    id: randomId(),
    email: normalizedEmail,
    nickname: nickname || normalizedEmail.split('@')[0],
    password_hash: hashPassword(password),
    created_at: nowIso(),
  };
  db.users.push(user);
  logAudit(db, {
    user_id: user.id,
    action: 'auth_register',
    target_type: 'user',
    target_id: user.id,
    metadata: { email: user.email },
  });
  saveDb(db);

  return res.status(201).json({ user_id: user.id, email: user.email, nickname: user.nickname });
});

app.post('/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email_and_password_required' });

  const db = loadDb();
  cleanupExpiredTokens(db);
  const normalizedEmail = String(email).trim().toLowerCase();
  const user = db.users.find((u) => u.email === normalizedEmail);
  if (!user || !verifyPassword(password, user.password_hash)) {
    saveDb(db);
    return res.status(401).json({ error: 'invalid_credentials' });
  }

  const token = randomToken();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_SECONDS * 1000).toISOString();
  db.auth_tokens.push({ token, user_id: user.id, expires_at: expiresAt, created_at: nowIso() });
  logAudit(db, {
    user_id: user.id,
    action: 'auth_login',
    target_type: 'user',
    target_id: user.id,
    metadata: {},
  });
  saveDb(db);

  return res.json({
    access_token: token,
    token_type: 'Bearer',
    expires_at: expiresAt,
    user: { id: user.id, email: user.email, nickname: user.nickname },
  });
});

app.post('/devices/bind', authMiddleware, (req, res) => {
  const { db, user } = req.ctx;
  const { device_id, device_name } = req.body || {};
  const resolvedDeviceId = device_id || randomId();

  let device = db.devices.find((d) => d.id === resolvedDeviceId);
  if (!device) {
    device = {
      id: resolvedDeviceId,
      device_name: device_name || `raspberrypi-${db.devices.length + 1}`,
      owner_user_id: user.id,
      session_id: null,
      session_link: null,
      device_key: randomToken(16),
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    db.devices.push(device);
    db.user_device_roles.push({ user_id: user.id, device_id: device.id, role: 'admin', created_at: nowIso() });
    seedFilesForDevice(db, device.id, user.id);
    logAudit(db, {
      user_id: user.id,
      action: 'device_bind_created',
      target_type: 'device',
      target_id: device.id,
      metadata: { device_name: device.device_name },
    });
    saveDb(db);
    return res.status(201).json({ device, role: 'admin' });
  }

  const rel = db.user_device_roles.find((r) => r.user_id === user.id && r.device_id === device.id);
  if (!rel) {
    return res.status(403).json({ error: 'device_exists_but_user_not_authorized' });
  }

  logAudit(db, {
    user_id: user.id,
    action: 'device_bind_existing',
    target_type: 'device',
    target_id: device.id,
    metadata: {},
  });
  saveDb(db);
  return res.json({ device, role: rel.role });
});

app.post('/sessions/create', authMiddleware, (req, res) => {
  const { db, user } = req.ctx;
  const { device_id } = req.body || {};
  if (!device_id) return res.status(400).json({ error: 'device_id_required' });

  const device = db.devices.find((d) => d.id === device_id);
  if (!device) return res.status(404).json({ error: 'device_not_found' });

  const authz = requireRoleOnDevice(db, user.id, device_id, ['admin']);
  if (!authz.ok) return res.status(403).json({ error: authz.reason });

  if (!device.session_id) {
    device.session_id = randomId();
    device.session_link = randomToken(12);
    device.updated_at = nowIso();
  }

  logAudit(db, {
    user_id: user.id,
    action: 'session_create',
    target_type: 'session',
    target_id: device.session_id,
    metadata: { device_id },
  });
  saveDb(db);

  return res.json({
    device_id: device.id,
    session_id: device.session_id,
    session_link: device.session_link,
    permanent: true,
  });
});

app.post('/relay/send', authMiddleware, (req, res) => {
  const { db, user } = req.ctx;
  const {
    session_id,
    from_user_role,
    msg_type,
    content,
    nonce = null,
    timestamp = Date.now(),
    message_id = randomId(),
  } = req.body || {};

  if (!session_id || !msg_type || !content) {
    return res.status(400).json({ error: 'session_id_msg_type_content_required' });
  }
  if (!['cmd', 'nl'].includes(msg_type)) return res.status(400).json({ error: 'invalid_msg_type' });

  const device = findDeviceBySession(db, session_id);
  if (!device) return res.status(404).json({ error: 'session_not_found' });

  const rel = db.user_device_roles.find((r) => r.user_id === user.id && r.device_id === device.id);
  if (!rel) return res.status(403).json({ error: 'not_bound_to_session' });

  const row = {
    id: db.sequences.relay_messages++,
    session_id: device.session_id,
    from_user_id: user.id,
    from_user_role: from_user_role || rel.role,
    msg_type,
    content,
    nonce,
    timestamp,
    message_id,
    created_at: nowIso(),
  };
  db.relay_messages.push(row);
  logAudit(db, {
    user_id: user.id,
    action: 'relay_send',
    target_type: 'session',
    target_id: device.session_id,
    metadata: { msg_type, relay_id: row.id },
  });
  saveDb(db);

  return res.status(201).json({ relay_id: row.id, stored: true });
});

app.get('/relay/pull', authMiddleware, (req, res) => {
  const { db, user } = req.ctx;
  const session_id = req.query.session_id;
  const cursor = Number.parseInt(req.query.cursor || '0', 10);
  const limit = Math.min(Number.parseInt(req.query.limit || '50', 10), 100);

  if (!session_id) return res.status(400).json({ error: 'session_id_required' });

  const device = findDeviceBySession(db, session_id);
  if (!device) return res.status(404).json({ error: 'session_not_found' });

  const rel = db.user_device_roles.find((r) => r.user_id === user.id && r.device_id === device.id);
  if (!rel) return res.status(403).json({ error: 'not_bound_to_session' });

  const messages = db.relay_messages
    .filter((m) => m.session_id === device.session_id && m.id > cursor)
    .sort((a, b) => a.id - b.id)
    .slice(0, limit);

  const nextCursor = messages.length > 0 ? messages[messages.length - 1].id : cursor;

  logAudit(db, {
    user_id: user.id,
    action: 'relay_pull',
    target_type: 'session',
    target_id: device.session_id,
    metadata: { cursor, next_cursor: nextCursor, count: messages.length },
  });
  saveDb(db);

  return res.json({ session_id: device.session_id, cursor: nextCursor, messages });
});

app.post('/share/create', authMiddleware, (req, res) => {
  const { db, user } = req.ctx;
  const { device_id, expires_in_minutes = 60 } = req.body || {};
  if (!device_id) return res.status(400).json({ error: 'device_id_required' });

  const device = db.devices.find((d) => d.id === device_id);
  if (!device) return res.status(404).json({ error: 'device_not_found' });

  const authz = requireRoleOnDevice(db, user.id, device_id, ['admin']);
  if (!authz.ok) return res.status(403).json({ error: authz.reason });

  const code = generateShareCode();
  const expiresAt = new Date(Date.now() + Number(expires_in_minutes) * 60 * 1000).toISOString();
  db.share_links.push({
    code,
    device_id,
    created_by: user.id,
    revoked: false,
    expires_at: expiresAt,
    created_at: nowIso(),
  });

  logAudit(db, {
    user_id: user.id,
    action: 'share_create',
    target_type: 'device',
    target_id: device_id,
    metadata: { code, expires_at: expiresAt },
  });
  saveDb(db);

  return res.status(201).json({ share_code: code, device_id, expires_at: expiresAt });
});

app.post('/share/join', authMiddleware, (req, res) => {
  const { db, user } = req.ctx;
  const { share_code } = req.body || {};
  if (!share_code) return res.status(400).json({ error: 'share_code_required' });

  const row = db.share_links.find((s) => s.code === share_code);
  if (!row) return res.status(404).json({ error: 'share_code_not_found' });
  if (row.revoked) return res.status(403).json({ error: 'share_code_revoked' });
  if (new Date(row.expires_at).getTime() <= Date.now()) return res.status(403).json({ error: 'share_code_expired' });

  const already = db.user_device_roles.find((r) => r.user_id === user.id && r.device_id === row.device_id);
  if (!already) {
    db.user_device_roles.push({ user_id: user.id, device_id: row.device_id, role: 'member', created_at: nowIso() });
  }

  logAudit(db, {
    user_id: user.id,
    action: 'share_join',
    target_type: 'device',
    target_id: row.device_id,
    metadata: { share_code },
  });
  saveDb(db);

  return res.json({ joined: true, device_id: row.device_id, role: already ? already.role : 'member' });
});

app.get('/files/list', authMiddleware, (req, res) => {
  const { db, user } = req.ctx;
  const { device_id, space_type = 'public' } = req.query;
  if (!device_id) return res.status(400).json({ error: 'device_id_required' });
  if (!['public', 'private'].includes(space_type)) return res.status(400).json({ error: 'invalid_space_type' });

  const rel = db.user_device_roles.find((r) => r.user_id === user.id && r.device_id === device_id);
  if (!rel) return res.status(403).json({ error: 'not_bound_to_device' });

  let rows = db.file_entries.filter((f) => f.device_id === device_id && f.space_type === space_type);
  if (space_type === 'private') {
    rows = rows.filter((f) => f.owner_user_id === user.id);
  }

  const result = rows
    .filter((f) => f.privacy_level > 0)
    .map((f) => ({
      file_id: f.id,
      name: f.name,
      size: f.size,
      space_type: f.space_type,
      privacy_level: f.privacy_level,
      created_at: f.created_at,
      preview_available: f.privacy_level >= 2,
    }));

  logAudit(db, {
    user_id: user.id,
    action: 'files_list',
    target_type: 'device',
    target_id: device_id,
    metadata: { space_type, count: result.length },
  });
  saveDb(db);

  return res.json({ device_id, space_type, files: result });
});

app.get('/files/preview', authMiddleware, (req, res) => {
  const { db, user } = req.ctx;
  const fileId = Number.parseInt(req.query.file_id, 10);
  if (!fileId) return res.status(400).json({ error: 'file_id_required' });

  const file = db.file_entries.find((f) => f.id === fileId);
  if (!file) return res.status(404).json({ error: 'file_not_found' });

  const rel = db.user_device_roles.find((r) => r.user_id === user.id && r.device_id === file.device_id);
  if (!rel) return res.status(403).json({ error: 'not_bound_to_device' });

  if (file.space_type === 'private' && file.owner_user_id !== user.id) {
    return res.status(403).json({ error: 'private_space_denied' });
  }

  if (file.privacy_level < 2) {
    return res.status(403).json({ error: 'preview_not_allowed_by_privacy_level' });
  }

  logAudit(db, {
    user_id: user.id,
    action: 'files_preview',
    target_type: 'file',
    target_id: String(file.id),
    metadata: {},
  });
  saveDb(db);

  return res.json({
    file_id: file.id,
    name: file.name,
    preview_excerpt: file.preview_excerpt,
    note: 'Cloud only provides limited preview metadata/content by policy.',
  });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'internal_server_error' });
});

app.listen(PORT, () => {
  initDb();
  console.log(`[clawos-cloud-server] listening on http://localhost:${PORT}`);
});
