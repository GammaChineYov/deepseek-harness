# dsh lock doctor - remove the orphan profile writer lock
#
# atomic-write creates "$env:USERPROFILE\.dsh\profiles\node_modules.lock" while it
# heals the shared profile module fallback. It deliberately never reclaims a stale
# lock ("orphan recovery is an operator action"), so a launch that dies mid-heal
# leaves the lock behind and every later launch dies after 2s with:
#     atomic-write: timed out waiting for the writer lock at ...node_modules.lock
#
# This script removes the lock ONLY when the pid stored inside is no longer alive.
# exit 0 = lock removed (or absent)   exit 3 = held by a live pid (leave it alone)
# exit 4 = present but could not be deleted

$lock = Join-Path $env:USERPROFILE '.dsh\profiles\node_modules.lock'

if (-not (Test-Path -LiteralPath $lock)) {
    Write-Host '[dsh-lock] no lock file - nothing to do'
    exit 0
}

$raw = (Get-Content -LiteralPath $lock -First 1 -ErrorAction SilentlyContinue)
if ($raw) { $raw = $raw.Trim() }

$alive = $false
if ($raw) {
    try {
        $null = Get-Process -Id ([int]$raw) -ErrorAction Stop
        $alive = $true
    } catch {
        $alive = $false
    }
}

if ($alive) {
    Write-Host ('[dsh-lock] KEEP - lock owner pid ' + $raw + ' is still running; wait for it to finish, then retry')
    exit 3
}

Remove-Item -LiteralPath $lock -Force -ErrorAction SilentlyContinue
if (Test-Path -LiteralPath $lock) {
    Write-Host '[dsh-lock] FAILED to remove the lock file (permission?)'
    exit 4
}

Write-Host ('[dsh-lock] REMOVED orphan lock (pid ' + $raw + ')')
exit 0
