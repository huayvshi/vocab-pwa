# 把 dist/ 发布到 GitHub Pages 的 gh-pages 分支
# 用法：
#   pwsh -File tools/deploy_pages.ps1                      # 用 vocab-pwa 仓库的 origin 地址
#   pwsh -File tools/deploy_pages.ps1 -RepoUrl https://github.com/you/vocab-pwa.git
#   pwsh -File tools/deploy_pages.ps1 -SkipBuild           # dist/ 已是最新时跳过构建
param(
    [string]$RepoUrl = "",
    [string]$Branch = "gh-pages",
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not $RepoUrl) {
    $RepoUrl = (git -C $root remote get-url origin 2>$null)
    if (-not $RepoUrl) { throw "没有找到 origin 远程仓库，请用 -RepoUrl 指定" }
}

if (-not $SkipBuild) {
    Write-Host "==> 构建 dist/ ..."
    & pnpm build
    if ($LASTEXITCODE -ne 0) { throw "构建失败" }
}

$stage = Join-Path $env:TEMP ("vocab-pages-" + [guid]::NewGuid().ToString("N").Substring(0, 8))
New-Item -ItemType Directory -Force -Path $stage | Out-Null
Copy-Item -Path (Join-Path $root "dist\*") -Destination $stage -Recurse -Force
# GitHub Pages 会跑 Jekyll，放 nojekyll 让它原样发布
New-Item -ItemType File -Force -Path (Join-Path $stage ".nojekyll") | Out-Null

$gitArgs = @("-c", "user.name=vocab-pwa-deploy", "-c", "user.email=deploy@local")

Push-Location $stage
try {
    git init -q
    git checkout -q -b $Branch
    git add -A
    & git @gitArgs commit -qm ("deploy " + (Get-Date -Format "yyyy-MM-dd HH:mm:ss"))
    git remote add origin $RepoUrl
    Write-Host "==> 推送到 $Branch ..."
    git push -f origin $Branch
    if ($LASTEXITCODE -ne 0) { throw "推送失败" }
    Write-Host "==> 完成。首次发布请到仓库 Settings → Pages 把 Source 设为 Deploy from a branch → $Branch / (root)"
}
finally {
    Pop-Location
    Remove-Item -Recurse -Force $stage -ErrorAction SilentlyContinue
}
