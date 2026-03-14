const path = require('path');
const { ensureDir, readJson, writeJson } = require('./utils');

function createStateStore(runtimeDir) {
  ensureDir(runtimeDir);
  const statePath = path.join(runtimeDir, 'state.json');
  const outboxPath = path.join(runtimeDir, 'outbox.json');

  function getState() {
    return readJson(statePath, { cursor: 0, processed_message_ids: [] });
  }

  function setState(next) {
    writeJson(statePath, next);
  }

  function getOutbox() {
    return readJson(outboxPath, []);
  }

  function setOutbox(rows) {
    writeJson(outboxPath, rows);
  }

  return {
    getState,
    setState,
    getOutbox,
    setOutbox,
  };
}

module.exports = {
  createStateStore,
};
