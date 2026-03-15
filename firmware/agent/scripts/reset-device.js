const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const configPath = path.join(root, 'config', 'agent.config.json');
const runtimeDir = path.join(root, 'runtime');

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
}

const current = readJson(configPath, {});
writeJson(configPath, {
  ...current,
  deviceId: '',
  deviceKey: '',
});

for (const name of ['network.json', 'provisioning-keys.json', 'pending-provisioning.json', 'provisioning-state.json', 'state.json', 'outbox.json']) {
  const filePath = path.join(runtimeDir, name);
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // ignore cleanup errors
  }
}

console.log('factory reset complete');
