#Requires -Version 7
# Usage: check-agentsmd.ps1 <CLAUDE.md|AGENTS.md> <issue#> [active|clean] [maxLines=200]
# active: the issue block exists and has all 5 sections. clean: no trace of the issue block remains.
param([Parameter(Mandatory)][string]$Path, [Parameter(Mandatory)][int]$Issue,
      [ValidateSet('active', 'clean')][string]$Mode = 'active', [int]$MaxLines = 200)
$failed = 0
if (-not (Test-Path -LiteralPath $Path)) { Write-Output "FAIL: $Path not found"; exit 1 }
$lines = @(Get-Content -LiteralPath $Path)
$start = "<!-- byte-gh-do-issue #$Issue START -->"; $end = "<!-- byte-gh-do-issue #$Issue END -->"

if ($lines.Count -le $MaxLines) { Write-Output "PASS: $($lines.Count) lines (<= $MaxLines)" }
else { Write-Output "WARN: $($lines.Count) lines (> $MaxLines) - prune it" }

if ($Mode -eq 'clean') {
    if ($lines | Where-Object { $_.Contains("byte-gh-do-issue #$Issue ") }) { Write-Output "FAIL: issue #$Issue markers still present"; $failed++ }
    else { Write-Output "PASS: no issue #$Issue markers" }
    if ($lines -match "^#+\s*Issue #$Issue(\D|$)") { Write-Output "FAIL: 'Issue #$Issue' heading still present"; $failed++ }
    else { Write-Output "PASS: no 'Issue #$Issue' heading" }
    exit [int]($failed -gt 0)
}

$si = @(0..($lines.Count - 1) | Where-Object { $lines[$_].Contains($start) })
$ei = @(0..($lines.Count - 1) | Where-Object { $lines[$_].Contains($end) })
if ($si.Count -eq 1 -and $ei.Count -eq 1) { Write-Output 'PASS: one START/END marker pair' }
else { Write-Output "FAIL: expected 1 START and 1 END marker, found $($si.Count)/$($ei.Count)"; exit 1 }
if ($ei[0] -le $si[0]) { Write-Output 'FAIL: END marker comes before START'; exit 1 }
$block = $lines[$si[0]..$ei[0]]
foreach ($sec in 'Tools', 'Tests', 'CI', 'Important Information', 'Gotchas') {
    if ($block -match "^#+\s*$sec\s*$") { Write-Output "PASS: section '$sec'" }
    else { Write-Output "FAIL: section '$sec' missing in issue block"; $failed++ }
}
if ($block -match '<command>|<trap>|<branch>|<N>') { Write-Output 'WARN: template placeholders remain' }
exit [int]($failed -gt 0)
