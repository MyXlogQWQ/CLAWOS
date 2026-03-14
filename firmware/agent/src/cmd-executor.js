const { spawn } = require('child_process');

function isCommandAllowed(command, allowCommands, denyPatterns) {
  const normalized = String(command || '').trim();
  if (!normalized) return { ok: false, reason: 'empty_command' };

  const firstToken = normalized.split(/\s+/)[0];
  const inWhitelist = allowCommands.includes(firstToken);
  if (!inWhitelist) {
    return { ok: false, reason: `command_not_whitelisted:${firstToken}` };
  }

  const lowered = normalized.toLowerCase();
  const denied = denyPatterns.some((pattern) => lowered.includes(String(pattern).toLowerCase()));
  if (denied) {
    return { ok: false, reason: 'dangerous_pattern_blocked' };
  }

  return { ok: true };
}

function runShellCommand(command, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(command, {
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
      resolve({
        code: timedOut ? -1 : code,
        timed_out: timedOut,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      });
    });
  });
}

async function executeCmd(messageText, cfg) {
  const authz = isCommandAllowed(messageText, cfg.allowCommands, cfg.denyPatterns);
  if (!authz.ok) {
    return {
      ok: false,
      type: 'cmd_result',
      error: authz.reason,
      command: messageText,
    };
  }

  const result = await runShellCommand(messageText, cfg.cmdTimeoutMs);
  return {
    ok: result.code === 0 && !result.timed_out,
    type: 'cmd_result',
    command: messageText,
    ...result,
  };
}

module.exports = {
  executeCmd,
};
