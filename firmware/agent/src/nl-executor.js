const { spawn } = require('child_process');

function buildArgs(argTemplates, text) {
  if (!Array.isArray(argTemplates) || !argTemplates.length) {
    return [text];
  }

  return argTemplates.map((arg) => String(arg).replaceAll('{text}', text));
}

function buildCommandTemplate(commandTemplate, text) {
  return String(commandTemplate).replaceAll('{text}', text.replaceAll('"', '\\"'));
}

function runOpenClawTemplate(commandTemplate, text, timeoutMs = 15000) {
  return new Promise((resolve) => {
    const child = spawn(buildCommandTemplate(commandTemplate, text), {
      shell: true,
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);

    child.stdout.on('data', (d) => {
      stdout += d.toString();
    });

    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, timedOut, stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

function runOpenClaw(command, argTemplates, text, timeoutMs = 15000) {
  return new Promise((resolve) => {
    const child = spawn(command, buildArgs(argTemplates, text), {
      shell: true,
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);

    child.stdout.on('data', (d) => {
      stdout += d.toString();
    });

    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, timedOut, stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

async function executeNl(messageText, cfg) {
  if (!cfg.openClawCommand && !cfg.openClawCommandTemplate) {
    return {
      ok: true,
      type: 'nl_result',
      engine: 'stub',
      output: `NL stub response: ${messageText}`,
    };
  }

  const result = cfg.openClawCommandTemplate
    ? await runOpenClawTemplate(cfg.openClawCommandTemplate, messageText, cfg.cmdTimeoutMs)
    : await runOpenClaw(cfg.openClawCommand, cfg.openClawArgs, messageText, cfg.cmdTimeoutMs);

  return {
    ok: result.code === 0 && !result.timedOut,
    type: 'nl_result',
    engine: 'openclaw',
    output: result.stdout,
    error: result.stderr || null,
    timed_out: result.timedOut,
  };
}

module.exports = {
  executeNl,
};
