param(
  [string]$BaseUrl = "http://localhost:8787"
)

$ErrorActionPreference = "Stop"

function New-Email([string]$prefix) {
  $suffix = Get-Date -Format "yyyyMMddHHmmssfff"
  return "$prefix-$suffix@example.com"
}

Write-Host "== CLAWOS cloud server smoke test =="
Write-Host "BaseUrl: $BaseUrl"

# 1) health
$health = Invoke-RestMethod -Method GET -Uri "$BaseUrl/health"
if (-not $health.ok) { throw "health check failed" }
Write-Host "[OK] /health"

# 2) register admin + login
$adminEmail = New-Email "admin"
$adminPass = "Passw0rd!"
$null = Invoke-RestMethod -Method POST -Uri "$BaseUrl/auth/register" -ContentType "application/json" -Body (@{
  email    = $adminEmail
  password = $adminPass
  nickname = "admin"
} | ConvertTo-Json)
Write-Host "[OK] register admin: $adminEmail"

$adminLogin = Invoke-RestMethod -Method POST -Uri "$BaseUrl/auth/login" -ContentType "application/json" -Body (@{
  email    = $adminEmail
  password = $adminPass
} | ConvertTo-Json)
$adminHeader = @{ Authorization = "Bearer $($adminLogin.access_token)" }
Write-Host "[OK] login admin"

# 3) bind device + create session
$bind = Invoke-RestMethod -Method POST -Uri "$BaseUrl/devices/bind" -Headers $adminHeader -ContentType "application/json" -Body (@{
  device_name = "pi-home-smoke"
} | ConvertTo-Json)
$deviceId = $bind.device.id
Write-Host "[OK] bind device: $deviceId"

$session = Invoke-RestMethod -Method POST -Uri "$BaseUrl/sessions/create" -Headers $adminHeader -ContentType "application/json" -Body (@{
  device_id = $deviceId
} | ConvertTo-Json)
$sessionId = $session.session_id
Write-Host "[OK] create session: $sessionId"

# 4) send relay + pull relay
$send = Invoke-RestMethod -Method POST -Uri "$BaseUrl/relay/send" -Headers $adminHeader -ContentType "application/json" -Body (@{
  session_id = $sessionId
  msg_type   = "cmd"
  content    = "BASE64_CIPHERTEXT"
  nonce      = "BASE64_NONCE"
} | ConvertTo-Json)
if (-not $send.stored) { throw "relay send failed" }
Write-Host "[OK] relay send"

$pull = Invoke-RestMethod -Method GET -Uri "$BaseUrl/relay/pull?session_id=$sessionId&cursor=0" -Headers $adminHeader
if ($pull.messages.Count -lt 1) { throw "relay pull empty" }
Write-Host "[OK] relay pull count: $($pull.messages.Count)"

# 5) create share, register member, join
$share = Invoke-RestMethod -Method POST -Uri "$BaseUrl/share/create" -Headers $adminHeader -ContentType "application/json" -Body (@{
  device_id = $deviceId
  expires_in_minutes = 30
} | ConvertTo-Json)
$shareCode = $share.share_code
Write-Host "[OK] create share: $shareCode"

$memberEmail = New-Email "member"
$memberPass = "Passw0rd!"
$null = Invoke-RestMethod -Method POST -Uri "$BaseUrl/auth/register" -ContentType "application/json" -Body (@{
  email    = $memberEmail
  password = $memberPass
  nickname = "member"
} | ConvertTo-Json)
$memberLogin = Invoke-RestMethod -Method POST -Uri "$BaseUrl/auth/login" -ContentType "application/json" -Body (@{
  email    = $memberEmail
  password = $memberPass
} | ConvertTo-Json)
$memberHeader = @{ Authorization = "Bearer $($memberLogin.access_token)" }
Write-Host "[OK] register+login member: $memberEmail"

$join = Invoke-RestMethod -Method POST -Uri "$BaseUrl/share/join" -Headers $memberHeader -ContentType "application/json" -Body (@{
  share_code = $shareCode
} | ConvertTo-Json)
if (-not $join.joined) { throw "share join failed" }
Write-Host "[OK] share join role: $($join.role)"

# 6) files list
$files = Invoke-RestMethod -Method GET -Uri "$BaseUrl/files/list?device_id=$deviceId&space_type=public" -Headers $memberHeader
Write-Host "[OK] files list public count: $($files.files.Count)"

Write-Host ""
Write-Host "Smoke test passed."
Write-Host ("Summary: device_id={0}, session_id={1}, share_code={2}" -f $deviceId, $sessionId, $shareCode)
