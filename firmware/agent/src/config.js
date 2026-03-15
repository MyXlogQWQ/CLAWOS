const path = require('path');
const { readJson } = require('./utils');

const ROOT = process.pkg ? path.dirname(process.execPath) : path.join(__dirname, '..');
const DEFAULT_CONFIG_PATH = process.env.AGENT_CONFIG_PATH || path.join(ROOT, 'config', 'agent.config.json');

function loadConfig() {
  const fileCfg = readJson(DEFAULT_CONFIG_PATH, {});

  return {
    cloudBaseUrl: process.env.AGENT_CLOUD_BASE_URL || fileCfg.cloudBaseUrl || 'http://localhost:8787',
    deviceId: process.env.AGENT_DEVICE_ID || fileCfg.deviceId || '',
    deviceKey: process.env.AGENT_DEVICE_KEY || fileCfg.deviceKey || '',
    pollIntervalMs: Number(process.env.AGENT_POLL_INTERVAL_MS || fileCfg.pollIntervalMs || 2000),
    pullLimit: Number(process.env.AGENT_PULL_LIMIT || fileCfg.pullLimit || 50),
    cmdTimeoutMs: Number(process.env.AGENT_CMD_TIMEOUT_MS || fileCfg.cmdTimeoutMs || 12000),
    outboxRetryIntervalMs: Number(process.env.AGENT_OUTBOX_RETRY_INTERVAL_MS || fileCfg.outboxRetryIntervalMs || 5000),
    runtimeDir: process.env.AGENT_RUNTIME_DIR || fileCfg.runtimeDir || path.join(ROOT, 'runtime'),
    allowCommands: fileCfg.allowCommands || ['echo', 'ls', 'pwd', 'date', 'whoami', 'uname', 'cat', 'df', 'free', 'uptime'],
    denyPatterns: fileCfg.denyPatterns || ['rm -rf', 'mkfs', 'dd if=', 'shutdown', 'reboot', 'init 0', 'poweroff'],
    openClawCommand: process.env.AGENT_OPENCLAW_COMMAND || fileCfg.openClawCommand || '',
    openClawArgs: Array.isArray(fileCfg.openClawArgs) ? fileCfg.openClawArgs : [],
    openClawCommandTemplate: process.env.AGENT_OPENCLAW_COMMAND_TEMPLATE || fileCfg.openClawCommandTemplate || '',
    cryptoMode: process.env.AGENT_CRYPTO_MODE || fileCfg.cryptoMode || 'passthrough',
    cryptoKeyB64: process.env.AGENT_CRYPTO_KEY_B64 || fileCfg.cryptoKeyB64 || '',
    provisioningEnabled: process.env.AGENT_PROVISIONING_ENABLED
      ? process.env.AGENT_PROVISIONING_ENABLED === 'true'
      : fileCfg.provisioningEnabled !== false,
    provisioningBind: process.env.AGENT_PROVISIONING_BIND || fileCfg.provisioningBind || '127.0.0.1',
    provisioningPort: Number(process.env.AGENT_PROVISIONING_PORT || fileCfg.provisioningPort || 8788),
    pairingCodeTtlMs: Number(process.env.AGENT_PAIRING_CODE_TTL_MS || fileCfg.pairingCodeTtlMs || 5 * 60 * 1000),
    provisioningSessionTtlMs: Number(process.env.AGENT_PROVISIONING_SESSION_TTL_MS || fileCfg.provisioningSessionTtlMs || 10 * 60 * 1000),
    provisioningClockSkewMs: Number(process.env.AGENT_PROVISIONING_CLOCK_SKEW_MS || fileCfg.provisioningClockSkewMs || 5 * 60 * 1000),
  };
}

function isProvisionedConfig(cfg) {
  return Boolean(cfg.deviceId && cfg.deviceKey);
}

module.exports = {
  loadConfig,
  isProvisionedConfig,
  DEFAULT_CONFIG_PATH,
};
