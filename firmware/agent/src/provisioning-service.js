const fs = require('fs');
const http = require('http');
const path = require('path');
const { createProvisioningStore } = require('./provisioning-store');
const { validateProvisionPacket } = require('./provisioning-packet');
const { readJson, writeJson } = require('./utils');

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk.toString('utf8');
      if (raw.length > 1024 * 1024) reject(new Error('body_too_large'));
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('invalid_json_body'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function resolveConfigPath() {
  return process.env.AGENT_CONFIG_PATH || path.join(path.join(__dirname, '..'), 'config', 'agent.config.json');
}

function applyProvisioningConfig(cfg, packet, store) {
  const configPath = resolveConfigPath();
  const currentConfig = readJson(configPath, {});
  const nextConfig = {
    ...currentConfig,
    cloudBaseUrl: packet.session.cloud_base_url || currentConfig.cloudBaseUrl || cfg.cloudBaseUrl,
    deviceId: packet.session.device_id,
    deviceKey: packet.session.device_key,
  };

  store.setPendingProvisioning({ packet, created_at: new Date().toISOString() });

  const ssid = String(packet.wifi.ssid || '').trim();
  if (!ssid || /^fail/i.test(ssid)) {
    throw new Error('wifi_connect_failed');
  }

  store.writeNetwork({
    ssid,
    password: packet.wifi.password || '',
    connected_at: new Date().toISOString(),
    simulated: true,
  });

  store.writeKeys({
    session_id: packet.session.session_id,
    session_link: packet.session.session_link,
    public_key: packet.keys.public_key,
    admin_private_key: packet.keys.admin_private_key,
    provisioned_at: new Date().toISOString(),
  });

  writeJson(configPath, nextConfig);
  store.clearPendingProvisioning();
}

function recoverProvisioningState(cfg, store) {
  const state = store.getState();
  const pending = store.getPendingProvisioning();
  const hasIdentity = Boolean(cfg.deviceId && cfg.deviceKey);

  if (pending) {
    store.clearPendingProvisioning();
    store.setState({ ...state, mode: 'factory', ble_advertising: true, last_error: 'recovered_from_incomplete_provisioning' });
    return;
  }

  if (hasIdentity) {
    store.setState({ ...state, mode: 'public-run', ble_advertising: false, last_error: null });
    return;
  }

  store.setState({ ...state, mode: 'factory', ble_advertising: true });
}

function startProvisioningService(cfg) {
  const store = createProvisioningStore(cfg.runtimeDir);
  recoverProvisioningState(cfg, store);

  return new Promise((resolve, reject) => {
    store.ensurePairCode(cfg.pairingCodeTtlMs);

    const server = http.createServer(async (req, res) => {
      try {
        if (req.method === 'GET' && req.url === '/health') {
          const current = store.ensurePairCode(cfg.pairingCodeTtlMs);
          return sendJson(res, 200, {
            ok: true,
            service: 'clawos-ble-provisioning',
            mode: current.mode,
            ble_advertising: current.ble_advertising,
            timestamp: new Date().toISOString(),
          });
        }

        if (req.method === 'GET' && req.url === '/status') {
          const current = store.ensurePairCode(cfg.pairingCodeTtlMs);
          return sendJson(res, 200, {
            mode: current.mode,
            ble_advertising: current.ble_advertising,
            pair_code: current.pair_code,
            pair_code_expires_at: current.pair_code_expires_at,
            provisioning_bind: cfg.provisioningBind,
            provisioning_port: cfg.provisioningPort,
          });
        }

        if (req.method === 'POST' && req.url === '/pair/start') {
          const body = await readBody(req);
          const current = store.ensurePairCode(cfg.pairingCodeTtlMs);
          if (body.pair_code !== current.pair_code) {
            return sendJson(res, 403, { error: 'invalid_pair_code' });
          }
          const session = store.createActiveSession(cfg.provisioningSessionTtlMs);
          return sendJson(res, 201, { session_token: session.session_token, expires_at: session.expires_at });
        }

        if (req.method === 'POST' && req.url === '/provision/apply') {
          const body = await readBody(req);
          const current = store.getState();
          const session = current.active_session;
          if (!session) return sendJson(res, 403, { error: 'pairing_session_required' });
          if (new Date(session.expires_at).getTime() <= Date.now()) {
            store.clearActiveSession();
            return sendJson(res, 403, { error: 'pairing_session_expired' });
          }

          const validation = validateProvisionPacket(body.packet, cfg, session.session_token, current.used_packet_ids || []);
          if (!validation.ok) return sendJson(res, 400, { error: validation.error });

          try {
            applyProvisioningConfig(cfg, validation.payload, store);
          } catch (err) {
            const failedState = store.getState();
            store.setState({
              ...failedState,
              mode: 'factory',
              ble_advertising: true,
              last_error: String(err.message || err),
            });
            return sendJson(res, 400, { error: String(err.message || err) });
          }

          store.rememberPacket(validation.payload.packet_id);
          store.clearActiveSession();
          const nextState = store.getState();
          store.setState({ ...nextState, mode: 'public-run', ble_advertising: false, last_error: null });
          sendJson(res, 200, { ok: true, mode: 'public-run', ble_advertising: false });
          setTimeout(() => server.close(() => resolve({ status: 'provisioned' })), 50);
          return;
        }

        if (req.method === 'POST' && req.url === '/factory-reset') {
          const body = await readBody(req);
          if (body.confirm !== 'RESET') return sendJson(res, 400, { error: 'reset_confirmation_required' });

          const configPath = resolveConfigPath();
          const currentConfig = readJson(configPath, {});
          writeJson(configPath, { ...currentConfig, deviceId: '', deviceKey: '' });

          for (const filePath of [store.paths.networkPath, store.paths.keysPath, store.paths.pendingPath]) {
            try {
              if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            } catch {
              // ignore cleanup errors
            }
          }

          const resetState = store.rotatePairCode(cfg.pairingCodeTtlMs);
          store.setState({ ...resetState, mode: 'factory', ble_advertising: true, last_error: null });
          return sendJson(res, 200, { ok: true, mode: 'factory', pair_code: store.getState().pair_code });
        }

        return sendJson(res, 404, { error: 'not_found' });
      } catch (err) {
        return sendJson(res, 500, { error: String(err.message || err) });
      }
    });

    server.on('error', reject);
    server.listen(cfg.provisioningPort, cfg.provisioningBind, () => {
      const current = store.getState();
      console.log(`[provisioning] BLE-like advertising enabled on http://${cfg.provisioningBind}:${cfg.provisioningPort}`);
      console.log(`[provisioning] mode=${current.mode}, pair_code=${current.pair_code}, expires_at=${current.pair_code_expires_at}`);
      console.log('[provisioning] waiting for first-time setup packet...');
    });
  });
}

module.exports = {
  startProvisioningService,
};
