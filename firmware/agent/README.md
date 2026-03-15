# CLAWOS Firmware Agent

当前 `firmware/agent` 已覆盖：

- Stage-1：轮询云端、执行 `cmd/nl`、回传结果
- Stage-2：首次配网、一次性配对码、配网数据包校验、模式切换、回滚/重置

## 启动模式

Agent 现在有两种启动模式：

1. 已配网模式
- 当 `config/agent.config.json` 里有 `deviceId + deviceKey`
- 启动后直接进入云端轮询模式

2. 未配网模式
- 当 `deviceId` 或 `deviceKey` 为空
- 启动后进入本地“BLE-like 配网服务”

## Stage-2 配网服务

未配网时启动：

```bash
npm start
```

会看到类似输出：

```text
[agent] device is unprovisioned, entering stage-2 provisioning mode
[provisioning] BLE-like advertising enabled on http://127.0.0.1:8788
[provisioning] mode=factory, pair_code=ABC123, expires_at=...
```

当前阶段 2 先用本地 HTTP 服务模拟 BLE 配网握手，方便在 PC 和树莓派上跑同一套逻辑。

## 配网接口

- `GET /health`
- `GET /status`
- `POST /pair/start`
- `POST /provision/apply`
- `POST /factory-reset`

## 一次性配网流程

1. 启动未配网 Agent
2. 从控制台获取 `pair_code`
3. 调用 `/pair/start`
4. 生成带完整性校验的 provisioning packet
5. 调用 `/provision/apply`
6. Agent 写入配置并关闭配网服务
7. 自动切到公网轮询模式

## 使用本地配网脚本

```bash
npm run provision -- ^
  --pair-code ABC123 ^
  --wifi-ssid MyWifi ^
  --wifi-password Passw0rd123 ^
  --device-id <device_id> ^
  --device-key <device_key> ^
  --session-id <session_id> ^
  --session-link <session_link>
```

可选参数：

- `--base-url http://127.0.0.1:8788`
- `--cloud-base-url http://localhost:8787`
- `--public-key PUBLIC_KEY_PLACEHOLDER`
- `--admin-private-key ADMIN_PRIVATE_KEY_PLACEHOLDER`

## 恢复与重置

工厂重置：

```bash
npm run factory-reset
```

执行后会：

- 清空 `deviceId/deviceKey`
- 清理 `runtime/network.json`
- 清理 `runtime/provisioning-keys.json`
- 清理 pending provisioning 状态
- 下次启动重新进入配网模式

## 配网包校验

当前配网包包含：

- `packet_id`
- `timestamp`
- `wifi`
- `session`
- `keys`
- `integrity`

已实现：

- 一次性配对码握手
- 配网会话过期
- HMAC-SHA256 完整性校验
- 时间戳校验
- `packet_id` 重放检测

## 文件落盘

配网成功后会写入：

- `config/agent.config.json`
- `runtime/network.json`
- `runtime/provisioning-keys.json`
- `runtime/provisioning-state.json`

## OpenClaw 配置

推荐配置：

```json
{
  "openClawCommandTemplate": "openclaw agent --agent main --message \"{text}\""
}
```
