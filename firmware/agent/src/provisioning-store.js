const crypto = require('crypto');
const path = require('path');
const { ensureDir, readJson, writeJson } = require('./utils');

function randomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

function randomToken() {
  return crypto.randomBytes(24).toString('hex');
}

function createProvisioningStore(runtimeDir) {
  ensureDir(runtimeDir);
  const statePath = path.join(runtimeDir, 'provisioning-state.json');
  const pendingPath = path.join(runtimeDir, 'pending-provisioning.json');
  const networkPath = path.join(runtimeDir, 'network.json');
  const keysPath = path.join(runtimeDir, 'provisioning-keys.json');

  function getState() {
    return readJson(statePath, {
      mode: 'factory',
      ble_advertising: true,
      pair_code: null,
      pair_code_expires_at: null,
      active_session: null,
      used_packet_ids: [],
      last_error: null,
      updated_at: null,
    });
  }

  function setState(next) {
    writeJson(statePath, { ...next, updated_at: new Date().toISOString() });
  }

  function rotatePairCode(ttlMs) {
    const state = getState();
    state.pair_code = randomCode();
    state.pair_code_expires_at = new Date(Date.now() + ttlMs).toISOString();
    state.active_session = null;
    setState(state);
    return state;
  }

  function ensurePairCode(ttlMs) {
    const state = getState();
    const expiresAt = state.pair_code_expires_at ? new Date(state.pair_code_expires_at).getTime() : 0;
    if (!state.pair_code || expiresAt <= Date.now()) {
      return rotatePairCode(ttlMs);
    }
    return state;
  }

  function createActiveSession(ttlMs) {
    const state = getState();
    state.active_session = {
      session_token: randomToken(),
      expires_at: new Date(Date.now() + ttlMs).toISOString(),
      created_at: new Date().toISOString(),
    };
    setState(state);
    return state.active_session;
  }

  function clearActiveSession() {
    const state = getState();
    state.active_session = null;
    setState(state);
  }

  function rememberPacket(packetId) {
    const state = getState();
    state.used_packet_ids = [...state.used_packet_ids, packetId].slice(-2000);
    setState(state);
  }

  return {
    getState,
    setState,
    ensurePairCode,
    rotatePairCode,
    createActiveSession,
    clearActiveSession,
    rememberPacket,
    getPendingProvisioning: () => readJson(pendingPath, null),
    setPendingProvisioning: (payload) => writeJson(pendingPath, payload),
    clearPendingProvisioning: () => writeJson(pendingPath, null),
    writeNetwork: (payload) => writeJson(networkPath, payload),
    writeKeys: (payload) => writeJson(keysPath, payload),
    paths: { statePath, pendingPath, networkPath, keysPath },
  };
}

module.exports = {
  createProvisioningStore,
};
