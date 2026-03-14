const { executeCmd } = require('./cmd-executor');
const { executeNl } = require('./nl-executor');
const { createStateStore } = require('./store');
const { createCryptoAdapter } = require('./crypto-adapter');
const { sleep } = require('./utils');

async function httpJson(url, options = {}) {
  const res = await fetch(url, options);
  const raw = await res.text();
  let payload;
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = { raw };
  }
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} on ${url}`);
    err.status = res.status;
    err.payload = payload;
    throw err;
  }
  return payload;
}

function createAgent(cfg) {
  const store = createStateStore(cfg.runtimeDir);
  const cryptoAdapter = createCryptoAdapter(cfg.cryptoMode, cfg.cryptoKeyB64);

  function getHeaders() {
    return {
      'Content-Type': 'application/json',
      'x-device-id': cfg.deviceId,
      'x-device-key': cfg.deviceKey,
    };
  }

  async function pullMessages(cursor) {
    const url = `${cfg.cloudBaseUrl}/agent/pull?cursor=${encodeURIComponent(cursor)}&limit=${encodeURIComponent(cfg.pullLimit)}`;
    return httpJson(url, { method: 'GET', headers: getHeaders() });
  }

  async function pushResult(msgType, payloadObj) {
    const content = cryptoAdapter.encrypt(JSON.stringify(payloadObj));
    return httpJson(`${cfg.cloudBaseUrl}/agent/push`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        msg_type: msgType,
        content,
        timestamp: Date.now(),
      }),
    });
  }

  async function runExecutor(msgType, plainText) {
    if (msgType === 'cmd') return executeCmd(plainText, cfg);
    if (msgType === 'nl') return executeNl(plainText, cfg);
    return { ok: false, type: 'unknown_type', error: `unsupported_msg_type:${msgType}` };
  }

  async function processMessage(row) {
    let plain;
    try {
      plain = cryptoAdapter.decrypt(row.content);
    } catch (err) {
      return {
        ok: false,
        type: 'decrypt_error',
        error: String(err.message || err),
        source_message_id: row.message_id,
      };
    }

    const result = await runExecutor(row.msg_type, plain);
    return {
      ok: result.ok,
      source_message_id: row.message_id,
      source_msg_type: row.msg_type,
      executed_at: new Date().toISOString(),
      result,
    };
  }

  async function flushOutbox() {
    const outbox = store.getOutbox();
    if (!outbox.length) return;

    const remain = [];
    for (const item of outbox) {
      try {
        await pushResult(item.msg_type, item.payload);
        console.log(`[agent] outbox flushed: ${item.payload.source_message_id || 'n/a'}`);
      } catch (err) {
        remain.push(item);
      }
    }
    if (remain.length !== outbox.length) store.setOutbox(remain);
  }

  async function enqueueOutbox(msgType, payloadObj) {
    const outbox = store.getOutbox();
    outbox.push({ msg_type: msgType, payload: payloadObj, created_at: new Date().toISOString() });
    store.setOutbox(outbox);
  }

  async function pollOnce() {
    const state = store.getState();
    const cursor = Number(state.cursor || 0);
    const processed = new Set(state.processed_message_ids || []);

    const pulled = await pullMessages(cursor);
    const rows = Array.isArray(pulled.messages) ? pulled.messages : [];
    if (!rows.length) return;

    let nextCursor = cursor;

    for (const row of rows) {
      nextCursor = Math.max(nextCursor, Number(row.id || 0));

      if (row.from_user_role === 'device') continue;
      if (processed.has(row.message_id)) continue;

      let payload;
      try {
        payload = await processMessage(row);
      } catch (err) {
        payload = {
          ok: false,
          source_message_id: row.message_id,
          source_msg_type: row.msg_type,
          error: String(err.message || err),
        };
      }

      try {
        await pushResult(row.msg_type, payload);
      } catch {
        await enqueueOutbox(row.msg_type, payload);
      }

      processed.add(row.message_id);
    }

    const processedList = Array.from(processed).slice(-2000);
    store.setState({ cursor: nextCursor, processed_message_ids: processedList, updated_at: new Date().toISOString() });
  }

  let stopped = false;

  async function start() {
    console.log(`[agent] starting with device_id=${cfg.deviceId}`);
    console.log(`[agent] cloud=${cfg.cloudBaseUrl}, pollIntervalMs=${cfg.pollIntervalMs}, crypto=${cfg.cryptoMode}`);

    while (!stopped) {
      try {
        await pollOnce();
      } catch (err) {
        console.error('[agent] poll error:', err.message, err.payload || '');
      }

      try {
        await flushOutbox();
      } catch (err) {
        console.error('[agent] outbox flush error:', err.message);
      }

      await sleep(cfg.pollIntervalMs);
    }
  }

  function stop() {
    stopped = true;
  }

  return {
    start,
    stop,
  };
}

module.exports = {
  createAgent,
};
