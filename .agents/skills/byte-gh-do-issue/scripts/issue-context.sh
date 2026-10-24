#!/usr/bin/env bash
# Usage: issue-context.sh <issue number or URL>
# Prints the issue's key fields, the bracket tag from its title, then body and comments.
issue=$1
[ -n "$issue" ] || { echo "FAIL: usage: issue-context.sh <issue>"; exit 1; }
command -v gh >/dev/null 2>&1 || { echo "FAIL: gh not installed"; exit 1; }
out=$(gh issue view "$issue" --json number,title,state,url,labels,assignees,milestone,body,comments --jq '
  ((.title | capture("\\[(?<t>[^\\]]+)\\]").t // "") | ascii_downcase | gsub("[^a-z0-9]+"; "-") | ltrimstr("-") | rtrimstr("-")) as $tag
  | "PASS: issue found",
    "INFO: number=\(.number)",
    "INFO: title=\(.title)",
    "INFO: state=\(.state)",
    "INFO: url=\(.url)",
    "INFO: labels=\([.labels[].name] | join(","))",
    "INFO: assignees=\([.assignees[].login] | join(","))",
    "INFO: milestone=\(.milestone.title // "")",
    (if $tag == "" then "WARN: no [TAG] in title - use a label or ask the user" else "INFO: tag=\($tag)" end),
    (if .state != "OPEN" then "WARN: issue is not open" else empty end),
    "----- BODY -----", .body,
    "----- COMMENTS (\(.comments | length)) -----",
    (.comments[] | "--- @\(.author.login) \(.createdAt)\n\(.body)")' 2>&1) \
  || { echo "FAIL: gh issue view: $out"; exit 1; }
printf '%s\n' "$out"
exit 0
