# CLAWOS Firmware Agent (Stage-1)

Raspberry Pi base agent implementation for stage-1:

- Resident loop polling cloud relay (`/agent/pull`)
- Message pipeline: decrypt -> dispatch (`cmd`/`nl`) -> execute -> encrypt -> push (`/agent/push`)
- Command whitelist + dangerous pattern blocking + timeout
- Local state persistence (`runtime/state.json`) and outbox retry (`runtime/outbox.json`)
- Local config/key file with chmod 600 best-effort

## Quick Start

1. Copy config template:

```bash
cp config/agent.config.example.json config/agent.config.json
```

2. Fill `deviceId` and `deviceKey` in `config/agent.config.json`.

3. Run agent:

```bash
npm start
```

## Build Executable (Pack JS to Binary)

Install dependencies first:

```bash
npm install
```

Build targets:

```bash
npm run build:linux-arm64
npm run build:linux-armv7
npm run build:win-x64
```

Generated files are in `dist/`.
On Windows build hosts, `linux-arm64` is validated. `linux-armv7` may require building on a Linux host.

## Deploy Binary on Raspberry Pi

Example layout:

```text
/opt/clawos/agent/
  clawos-agent-linux-arm64
  config/agent.config.json
  runtime/
```

Run manually:

```bash
chmod +x /opt/clawos/agent/clawos-agent-linux-arm64
AGENT_CONFIG_PATH=/opt/clawos/agent/config/agent.config.json /opt/clawos/agent/clawos-agent-linux-arm64
```

Notes:

- When packaged, default root path is the executable directory (`process.execPath` dir).
- You can always override config path via `AGENT_CONFIG_PATH`.

## Auto Start (systemd)

- Node script mode service sample:
  - `systemd/clawos-agent.service`
- Binary mode service sample:
  - `systemd/clawos-agent-bin.service`

## Stage-1 Smoke Test

This script starts cloud server + agent and runs an end-to-end command flow:

```bash
npm run smoke
```

## Notes

- `cryptoMode=passthrough` means payload is base64(plaintext) for local development.
- `cryptoMode=aes-gcm` enables local AES-256-GCM envelope encryption.
- `nl` executor uses stub output unless `openClawCommand` is configured.
- OpenClaw CLI supports fixed args via `openClawArgs`, for example:
  `openClawCommand: "openclaw"`
  `openClawArgs: ["agent", "--agent", "main", "--message", "{text}"]`
