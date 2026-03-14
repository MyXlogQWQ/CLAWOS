param(
  [string]$BaseUrl = "http://localhost:8787"
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..\..\..")
$cloudDir = Join-Path $root "cloud-server"
$agentDir = Join-Path $root "firmware\agent"
$configPath = Join-Path $agentDir "config\agent.config.json"

function Encode-Text([string]$text) {
  return [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($text))
}

function Decode-Text([string]$b64) {
  return [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64))
}

function New-Email([string]$prefix) {
  $suffix = Get-Date -Format "yyyyMMddHHmmssfff"
  return "$prefix-$suffix@example.com"
}

Write-Host "== Stage-1 agent smoke test =="
Write-Host "Root: $root"

$cloudProc = Start-Process -FilePath node -ArgumentList "src/server.js" -WorkingDirectory $cloudDir -PassThru
Start-Sleep -Seconds 2

$agentProc = $null

try {
  $health = Invoke-RestMethod -Method GET -Uri "$BaseUrl/health"
  if (-not $health.ok) { throw "cloud health failed" }

  $email = New-Email "agent-admin"
  $password = "Passw0rd!"
  $null = Invoke-RestMethod -Method POST -Uri "$BaseUrl/auth/register" -ContentType "application/json" -Body (@{email=$email;password=$password;nickname='agent-admin'} | ConvertTo-Json)
  $login = Invoke-RestMethod -Method POST -Uri "$BaseUrl/auth/login" -ContentType "application/json" -Body (@{email=$email;password=$password} | ConvertTo-Json)
  $h = @{ Authorization = "Bearer $($login.access_token)" }

  $bind = Invoke-RestMethod -Method POST -Uri "$BaseUrl/devices/bind" -Headers $h -ContentType "application/json" -Body (@{device_name='pi-agent-smoke'} | ConvertTo-Json)
  $deviceId = $bind.device.id
  $deviceKey = $bind.device.device_key
  $session = Invoke-RestMethod -Method POST -Uri "$BaseUrl/sessions/create" -Headers $h -ContentType "application/json" -Body (@{device_id=$deviceId} | ConvertTo-Json)
  $sessionId = $session.session_id

  @{
    cloudBaseUrl = $BaseUrl
    deviceId = $deviceId
    deviceKey = $deviceKey
    pollIntervalMs = 1000
    pullLimit = 50
    cmdTimeoutMs = 10000
    outboxRetryIntervalMs = 2000
    cryptoMode = "passthrough"
    allowCommands = @("echo","date","whoami","pwd")
    denyPatterns = @("rm -rf","shutdown","reboot")
    openClawCommand = ""
  } | ConvertTo-Json -Depth 5 | Set-Content -Path $configPath -Encoding UTF8

  $agentProc = Start-Process -FilePath node -ArgumentList "src/index.js" -WorkingDirectory $agentDir -PassThru
  Start-Sleep -Seconds 2

  $cmdPlain = "echo AGENT_STAGE1_OK"
  $cmdB64 = Encode-Text $cmdPlain
  $null = Invoke-RestMethod -Method POST -Uri "$BaseUrl/relay/send" -Headers $h -ContentType "application/json" -Body (@{session_id=$sessionId;msg_type='cmd';content=$cmdB64} | ConvertTo-Json)

  $found = $false
  $decoded = $null
  for ($i=0; $i -lt 10; $i++) {
    Start-Sleep -Seconds 1
    $pull = Invoke-RestMethod -Method GET -Uri "$BaseUrl/relay/pull?session_id=$sessionId&cursor=0&limit=100" -Headers $h
    $deviceMsg = $pull.messages | Where-Object { $_.from_user_role -eq 'device' } | Select-Object -First 1
    if ($deviceMsg) {
      $decoded = Decode-Text $deviceMsg.content
      $found = $true
      break
    }
  }

  if (-not $found) {
    throw "agent response not found in relay"
  }

  Write-Host "[OK] device_id: $deviceId"
  Write-Host "[OK] session_id: $sessionId"
  Write-Host "[OK] agent returned payload:"
  Write-Host $decoded
  Write-Host ""
  Write-Host "Stage-1 smoke test passed."
}
finally {
  if ($agentProc) {
    Stop-Process -Id $agentProc.Id -Force -ErrorAction SilentlyContinue
  }
  if ($cloudProc) {
    Stop-Process -Id $cloudProc.Id -Force -ErrorAction SilentlyContinue
  }
}
