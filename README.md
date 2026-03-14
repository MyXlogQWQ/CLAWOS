# CLAWOS

当前仓库已实现并可本地联调的范围，主要是：

- `cloud-server/`：本地云端中转服务
- `firmware/agent/`：运行在树莓派上的 Agent，目前可先在 Windows PC 上模拟运行
- `ref-data/`：产品说明和开发阶段文档

目前可稳定测试的是开发步骤中的阶段 0 和阶段 1：

- 阶段 0：账号、设备、会话、消息中转
- 阶段 1：Agent 轮询、`cmd` 执行、`nl` 执行、结果回传

## 目录

```text
cloud-server/      本地云端服务
firmware/agent/    设备 Agent，可先在 PC 上运行
ref-data/          产品说明与开发计划
web/               其他独立页面/实验内容
```

## 运行环境

- Node.js 18+
- Windows PowerShell
- 已安装 `openclaw`

如果要测试 `nl`，需要保证这条命令在终端可执行：

```powershell
openclaw agent --agent main --message "你好"
```

## 1. 启动云端服务

```powershell
cd e:\TianJi\CLAWOS\cloud-server
npm install
npm start
```

启动后默认地址：

```text
http://localhost:8787
```

本地网页调试台：

```text
http://localhost:8787/
```

## 2. 配置并启动 Agent

先检查配置文件：

[firmware/agent/config/agent.config.json](/e:/TianJi/CLAWOS/firmware/agent/config/agent.config.json)

当前关键字段含义：

- `cloudBaseUrl`：云端地址
- `deviceId`：当前 Agent 对应的设备 ID
- `deviceKey`：当前 Agent 对应的设备密钥
- `cryptoMode`：本地联调建议用 `passthrough`
- `openClawCommandTemplate`：完整 OpenClaw 命令模板，推荐使用

`nl` 推荐配置如下：

```json
{
  "openClawCommandTemplate": "openclaw agent --agent main --message \"{text}\""
}
```

启动 Agent：

```powershell
cd e:\TianJi\CLAWOS\firmware\agent
npm install
npm start
```

正常启动时会看到：

```text
[agent] starting with device_id=...
[agent] cloud=http://localhost:8787, pollIntervalMs=1000, crypto=passthrough
```

## 3. 如何绑定正确设备

Agent 必须和网页里操作的是同一台设备。

如果网页里绑定的是这台设备：

- `device_id = 64a521d6-b29e-4f5a-9663-af20c52c7710`

那么 `firmware/agent/config/agent.config.json` 里的 `deviceId` 和 `deviceKey` 也必须对应这台设备。

注意：

- `session_id` 不写进 Agent 配置
- Agent 只依赖 `deviceId + deviceKey`

设备信息存放在：

[cloud-server/data/db.json](/e:/TianJi/CLAWOS/cloud-server/data/db.json)

## 4. 网页端如何使用

打开：

```text
http://localhost:8787/
```

按这个顺序操作：

1. 注册或登录
2. 绑定设备
3. 创建会话
4. 发送消息
5. 拉取消息

常用按钮：

- `注册`
- `登录`
- `绑定设备`
- `创建会话`
- `发送消息`
- `拉取消息`

## 5. 如何测试 cmd

在网页中：

- `msg_type` 选 `cmd`
- `content` 填 base64 之后的命令文本

例如命令明文：

```text
echo hello_cmd
```

PowerShell 转 base64：

```powershell
[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("echo hello_cmd"))
```

把输出粘贴到网页 `content` 后发送。

然后点击 `拉取消息`，你会看到：

- 一条你自己发出的消息
- 一条 `from_user_role=device` 的设备回传消息

## 6. 如何测试 nl

在网页中：

- `msg_type` 选 `nl`
- `content` 必须填 base64 之后的自然语言文本

例如明文：

```text
在桌面创建一个名为 test-folder 的文件夹
```

PowerShell 转 base64：

```powershell
[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("在桌面创建一个名为 test-folder 的文件夹"))
```

然后发送。

注意：

- 不要直接把中文明文填进 `content`
- 当前 `cryptoMode=passthrough`，协议约定就是 `base64(明文)`

## 7. 如何查看执行结果

网页 `拉取消息` 返回的数据中：

- 你发出的消息在 `from_user_role=admin`
- 设备回传消息在 `from_user_role=device`

设备回传的 `content` 仍然是 base64，需要再解码一次。

PowerShell 解码示例：

```powershell
[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String("<content>"))
```

## 8. 常见问题

### 1) Agent 一直 `fetch failed`

说明云端没启动，先运行：

```powershell
cd e:\TianJi\CLAWOS\cloud-server
npm start
```

### 2) 网页发送成功，但 Agent 没反应

通常检查这几项：

- 网页绑定的设备和 Agent 配置的 `deviceId` 不是同一台
- `deviceKey` 对不上
- 网页 `content` 传的是明文，不是 base64

### 3) `nl` 没有真实执行 OpenClaw

检查：

- `agent.config.json` 里是否配置了 `openClawCommandTemplate`
- 终端里是否能手工执行：

```powershell
openclaw agent --agent main --message "你好"
```

### 4) OpenClaw 提示 gateway fallback

说明 Agent 已经调到了 OpenClaw，但本地 gateway 没正常接上，OpenClaw 回退到了 embedded 模式。这个不影响链路联调，但会影响最终执行表现。

## 9. 一键自测

云端自测：

```powershell
cd e:\TianJi\CLAWOS\cloud-server
npm run smoke
```

Agent 自测：

```powershell
cd e:\TianJi\CLAWOS\firmware\agent
npm run smoke
```

注意：`firmware/agent` 的 smoke 会改写 `firmware/agent/config/agent.config.json`，跑完后如果你要继续联调自己的设备，需要把配置改回你自己的 `deviceId/deviceKey/openClawCommandTemplate`。

## 10. 当前限制

当前仓库还没有完成这些内容：

- BLE 首次配网
- 正式手机/桌面客户端
- 自动加解密输入框
- 文件同步完整链路
- 局域网直连

所以现在的正确使用方式是：

- 用 `cloud-server/` 提供本地网页调试
- 用 `firmware/agent/` 在 PC 上模拟设备端
- 手工用 base64 发送 `cmd/nl`
