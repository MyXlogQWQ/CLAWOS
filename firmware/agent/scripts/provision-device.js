const crypto = require('crypto');

function getArg(name, fallback = '') {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function createIntegrity(payload, secret) {
  return crypto.createHmac('sha256', String(secret)).update(stableStringify(payload)).digest('hex');
}

async function main() {
  const baseUrl = getArg('base-url', 'http://127.0.0.1:8788');
  const pairCode = getArg('pair-code');
  const wifiSsid = getArg('wifi-ssid');
  const wifiPassword = getArg('wifi-password');
  const deviceId = getArg('device-id');
  const deviceKey = getArg('device-key');
  const sessionId = getArg('session-id');
  const sessionLink = getArg('session-link');
  const cloudBaseUrl = getArg('cloud-base-url', 'http://localhost:8787');
  const publicKey = getArg('public-key', 'PUBLIC_KEY_PLACEHOLDER');
  const adminPrivateKey = getArg('admin-private-key', 'ADMIN_PRIVATE_KEY_PLACEHOLDER');

  if (!pairCode || !wifiSsid || !deviceId || !deviceKey || !sessionId || !sessionLink) {
    throw new Error('missing required args: --pair-code --wifi-ssid --device-id --device-key --session-id --session-link');
  }

  const pairRes = await fetch(`${baseUrl}/pair/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pair_code: pairCode }),
  });
  const pairPayload = await pairRes.json();
  if (!pairRes.ok) throw new Error(`pair/start failed: ${JSON.stringify(pairPayload)}`);

  const packet = {
    packet_id: crypto.randomUUID(),
    timestamp: Date.now(),
    wifi: { ssid: wifiSsid, password: wifiPassword },
    session: {
      device_id: deviceId,
      device_key: deviceKey,
      session_id: sessionId,
      session_link: sessionLink,
      cloud_base_url: cloudBaseUrl,
    },
    keys: {
      public_key: publicKey,
      admin_private_key: adminPrivateKey,
    },
  };
  packet.integrity = createIntegrity(packet, pairPayload.session_token);

  const applyRes = await fetch(`${baseUrl}/provision/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_token: pairPayload.session_token, packet }),
  });
  const applyPayload = await applyRes.json();
  if (!applyRes.ok) throw new Error(`provision/apply failed: ${JSON.stringify(applyPayload)}`);

  console.log(JSON.stringify(applyPayload, null, 2));
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
