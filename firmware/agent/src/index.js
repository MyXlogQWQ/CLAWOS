const { loadConfig, DEFAULT_CONFIG_PATH } = require('./config');
const { createAgent } = require('./agent');

async function main() {
  let cfg;
  try {
    cfg = loadConfig();
  } catch (err) {
    console.error('[agent] config error:', err.message);
    console.error(`[agent] expected config at: ${DEFAULT_CONFIG_PATH}`);
    process.exit(1);
  }

  const agent = createAgent(cfg);

  process.on('SIGINT', () => {
    console.log('[agent] SIGINT received, stopping...');
    agent.stop();
  });

  process.on('SIGTERM', () => {
    console.log('[agent] SIGTERM received, stopping...');
    agent.stop();
  });

  await agent.start();
}

main().catch((err) => {
  console.error('[agent] fatal:', err);
  process.exit(1);
});
