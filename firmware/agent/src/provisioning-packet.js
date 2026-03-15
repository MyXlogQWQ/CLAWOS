const crypto = require('crypto');

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function createIntegrity(payload, secret) {
  return crypto.createHmac('sha256', String(secret)).update(stableStringify(payload)).digest('hex');
}

function verifyIntegrity(payload, integrity, secret) {
  const expected = createIntegrity(payload, secret);
  const actual = String(integrity || '');
  if (!actual || actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(actual, 'utf8'), Buffer.from(expected, 'utf8'));
}

function validateProvisionPacket(packet, cfg, sessionToken, usedPacketIds) {
  if (!packet || typeof packet !== 'object') return { ok: false, error: 'invalid_packet' };

  const { integrity, packet_id: packetId, timestamp, wifi, session, keys } = packet;
  if (!packetId || !timestamp || !wifi || !session || !keys) {
    return { ok: false, error: 'packet_missing_required_fields' };
  }

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return { ok: false, error: 'invalid_packet_timestamp' };
  if (Math.abs(Date.now() - ts) > cfg.provisioningClockSkewMs) {
    return { ok: false, error: 'packet_timestamp_out_of_range' };
  }
  if (usedPacketIds.includes(packetId)) return { ok: false, error: 'packet_replay_detected' };

  const basePayload = { packet_id: packetId, timestamp: ts, wifi, session, keys };
  if (!verifyIntegrity(basePayload, integrity, sessionToken)) {
    return { ok: false, error: 'packet_integrity_check_failed' };
  }

  for (const field of ['device_id', 'device_key', 'session_id', 'session_link']) {
    if (!session[field]) return { ok: false, error: `session_field_required:${field}` };
  }
  if (!wifi.ssid) return { ok: false, error: 'wifi_ssid_required' };
  if (!keys.public_key) return { ok: false, error: 'public_key_required' };
  if (!keys.admin_private_key) return { ok: false, error: 'admin_private_key_required' };

  return { ok: true, payload: basePayload };
}

module.exports = {
  createIntegrity,
  validateProvisionPacket,
};
