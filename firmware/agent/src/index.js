const { loadConfig, isProvisionedConfig, DEFAULT_CONFIG_PATH } = require('./config');
const { createAgent } = require('./agent');
const { startProvisioningService } = require('./provisioning-service');

let stopRequested = false;
let activeAgent = null;

async function run() {
  while (!stopRequested) {
    let cfg;
    try {
      cfg = loadConfig();
    } catch (err) {
      console.error('[agent] config error:', err.message);
      console.error(`[agent] expected config at: ${DEFAULT_CONFIG_PATH}`);
      process.exit(1);
    }

    if (!isProvisionedConfig(cfg)) {
      if (!cfg.provisioningEnabled) {
        console.error('[agent] device is not provisioned and provisioning is disabled.');
        process.exit(1);
      }
      console.log('[agent] device is unprovisioned, entering stage-2 provisioning mode');
      await startProvisioningService(cfg);
      continue;
    }

    activeAgent = createAgent(cfg);
    await activeAgent.start();
    activeAgent = null;
  }
}

process.on('SIGINT', () => {
  console.log('[agent] SIGINT received, stopping...');
  stopRequested = true;
  if (activeAgent) activeAgent.stop();
});

process.on('SIGTERM', () => {
  console.log('[agent] SIGTERM received, stopping...');
  stopRequested = true;
  if (activeAgent) activeAgent.stop();
});

run().catch((err) => {
  console.error('[agent] fatal:', err);
  process.exit(1);
});
