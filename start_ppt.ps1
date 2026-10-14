# myPPT簡報工作室 — 釋放埠號並啟動本機 dev server
# 用法：在專案根目錄執行 .\start_ppt.ps1

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
Set-Location $Root

function Get-AdminPort {
    $port = 8787
    $envFile = Join-Path $Root ".env"
    if (Test-Path $envFile) {
        foreach ($line in Get-Content $envFile -Encoding UTF8) {
            if ($line -match '^\s*ADMIN_PORT\s*=\s*(\d+)\s*$') {
                $port = [int]$Matches[1]
                break
            }
        }
    }
    return $port
}

function Stop-ListenersOnPort {
    param([int]$Port)
    $pids = @()
    try {
        $pids = @(Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess -Unique)
    } catch {
        # Get-NetTCPConnection may be unavailable in some shells
    }
    foreach ($procId in $pids) {
        if (-not $procId) { continue }
        try {
            $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
            if ($proc) {
                Write-Host "停止佔用埠 $Port 的行程：$($proc.ProcessName) (PID $procId)"
                Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
            }
        } catch {
            Write-Warning "Could not stop PID $procId"
        }
    }
    if ($pids.Count -gt 0) {
        Start-Sleep -Seconds 1
    }
}

function Test-NodeAvailable {
    $node = Get-Command node -ErrorAction SilentlyContinue
    if (-not $node) {
        throw "node not found. Install Node.js 20+ and add it to PATH."
    }
    $versionRaw = (& node --version).Trim()
    $version = $versionRaw -replace '^v', ''
    $major = [int]($version.Split('.')[0])
    if ($major -lt 20) {
        throw "Node.js >= 20 required, found $versionRaw"
    }
}

function Wait-ForHealth {
    param([int]$Port, [int]$TimeoutSec = 45)
    $url = "http://localhost:$Port/api/health"
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        try {
            $res = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3
            if ($res.StatusCode -eq 200) { return $true }
        } catch {
            Start-Sleep -Seconds 1
        }
    }
    return $false
}

Write-Host "myPPT簡報工作室啟動"
Write-Host "專案目錄：$Root"

Test-NodeAvailable

$port = Get-AdminPort
Write-Host "Admin 埠號：$port"

Stop-ListenersOnPort -Port $port

if (-not (Test-Path (Join-Path $Root "node_modules"))) {
    Write-Host "首次執行：npm install …"
    npm install
    if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
}

if (-not (Test-Path (Join-Path $Root ".env"))) {
    Write-Warning ".env 不存在。請複製 .env.example 為 .env，並設定 ADMIN_SECRET、GOOGLE_CLIENT_ID、GOOGLE_ALLOWED_EMAILS。"
}

Write-Host "啟動 dev server（新視窗）…"
Start-Process -FilePath "powershell.exe" -WorkingDirectory $Root -ArgumentList @(
    "-NoExit",
    "-NoProfile",
    "-Command",
    "npm run dev"
)

Start-Sleep -Seconds 2
Write-Host "等待 /api/health …"
if (Wait-ForHealth -Port $port) {
    Write-Host ""
    Write-Host "服務已正常運作：" -ForegroundColor Green
    Write-Host "  Admin：  http://localhost:$port/admin/"
    Write-Host "  Studio：http://localhost:$port/admin/?deck=taiwan-ai-strategic-blueprint"
    Write-Host "  Health：http://localhost:$port/api/health"
    Write-Host ""
    Write-Host "伺服器日誌請見新開啟的 PowerShell 視窗。關閉該視窗即可停止服務。"
} else {
    Write-Warning "在時限內無法連線 /api/health。請檢查新視窗中的錯誤訊息。"
    exit 1
}
