#Requires -Version 7
# Usage: issue-context.ps1 <issue number or URL>
# Prints the issue's key fields, the bracket tag from its title, then body and comments.
param([Parameter(Mandatory)][string]$Issue)
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { Write-Output 'FAIL: gh not installed'; exit 1 }
$raw = gh issue view $Issue --json number,title,state,url,labels,assignees,milestone,body,comments 2>&1
if ($LASTEXITCODE -ne 0) { Write-Output "FAIL: gh issue view: $raw"; exit 1 }
$i = ($raw | Out-String) | ConvertFrom-Json
Write-Output 'PASS: issue found'
Write-Output "INFO: number=$($i.number)"
Write-Output "INFO: title=$($i.title)"
Write-Output "INFO: state=$($i.state)"
Write-Output "INFO: url=$($i.url)"
Write-Output "INFO: labels=$(($i.labels | ForEach-Object name) -join ',')"
Write-Output "INFO: assignees=$(($i.assignees | ForEach-Object login) -join ',')"
Write-Output "INFO: milestone=$($i.milestone.title)"
if ($i.title -match '\[([^\]]+)\]') {
    $tag = ($Matches[1].ToLower() -replace '[^a-z0-9]+', '-').Trim('-')
    Write-Output "INFO: tag=$tag"
} else { Write-Output 'WARN: no [TAG] in title - use a label or ask the user' }
if ($i.state -ne 'OPEN') { Write-Output 'WARN: issue is not open' }
Write-Output '----- BODY -----'
Write-Output $i.body
Write-Output "----- COMMENTS ($(@($i.comments).Count)) -----"
foreach ($c in $i.comments) { Write-Output "--- @$($c.author.login) $($c.createdAt)"; Write-Output $c.body }
exit 0
