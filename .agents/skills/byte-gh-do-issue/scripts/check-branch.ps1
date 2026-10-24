#Requires -Version 7
# Usage: check-branch.ps1 <branch> <issue#>
# Format: <tag>/issue<N>-<slug>, e.g. bug/issue9-auth-import-issue
param([Parameter(Mandatory)][string]$Branch, [Parameter(Mandatory)][int]$Issue)
$failed = 0
if ($Branch -cmatch '^[a-z0-9]+/issue[0-9]+-[a-z0-9]+(-[a-z0-9]+){1,4}$') { Write-Output 'PASS: format <tag>/issue<N>-<2-5 word slug>' }
else { Write-Output "FAIL: '$Branch' does not match <tag>/issue<N>-<2-5 kebab words>"; $failed++ }
if ($Branch -match "/issue$Issue-") { Write-Output "PASS: issue number $Issue" } else { Write-Output "FAIL: issue number is not $Issue"; $failed++ }
if ($Branch.Length -le 60) { Write-Output "PASS: $($Branch.Length) chars (<= 60)" } else { Write-Output "WARN: $($Branch.Length) chars (> 60) - shorten the slug" }
git check-ref-format --branch $Branch *> $null
if ($LASTEXITCODE -eq 0) { Write-Output 'PASS: valid git ref' } else { Write-Output 'FAIL: invalid git ref'; $failed++ }
git show-ref --verify --quiet "refs/heads/$Branch"
if ($LASTEXITCODE -eq 0) { Write-Output 'WARN: local branch already exists - resume or pick another name' }
git ls-remote --exit-code --heads origin $Branch *> $null
if ($LASTEXITCODE -eq 0) { Write-Output 'WARN: remote branch already exists - resume or pick another name' }
exit [int]($failed -gt 0)
