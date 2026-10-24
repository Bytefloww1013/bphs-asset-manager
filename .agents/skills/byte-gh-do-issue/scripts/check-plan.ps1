#Requires -Version 7
# Usage: check-plan.ps1 <temp-gh-issue<N>-implementation.md>
param([Parameter(Mandatory)][string]$Path)
$failed = 0
if (-not (Test-Path -LiteralPath $Path)) { Write-Output "FAIL: $Path not found"; exit 1 }
$lines = @(Get-Content -LiteralPath $Path)

foreach ($k in '## Decisions', '**Task:**', '**Guardrails:**', '**Definition of Done', '## Ownership') {
    if ($lines | Where-Object { $_.Contains($k) }) { Write-Output "PASS: has '$k'" }
    else { Write-Output "FAIL: missing '$k'"; $failed++ }
}

$open = @($lines | Where-Object { $_ -match '^\s*- \[ \]' })
$done = @($lines | Where-Object { $_ -match '^\s*- \[[xX]\]' })
$total = $open.Count + $done.Count
if ($total -eq 0) { Write-Output 'FAIL: no slices (- [ ] checkboxes) found'; $failed++ }
elseif ($open.Count -eq 0) { Write-Output "PASS: $total/$total slices done" }
else {
    Write-Output "FAIL: $($open.Count) of $total slices unchecked"
    Write-Output "NEXT: $($open[0].Trim())"
    $failed++
}
if ($lines -match '<slice>|<name>|<paths>') { Write-Output 'WARN: template placeholders remain' }
git ls-files --error-unmatch $Path *> $null
if ($LASTEXITCODE -eq 0) { Write-Output 'WARN: plan is tracked by git - it should be in .git/info/exclude' }
exit [int]($failed -gt 0)
