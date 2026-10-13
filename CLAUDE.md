<!-- rtk-instructions v2 -->
# Command output

Command output here is condensed to save tokens, keeping every signal and
dropping costly noise. Treat it as the complete result: run commands
normally, and batch related commands into one call to avoid extra turns.
Truncated results state their recovery path in their own output. Re-run a
command as `rtk proxy <cmd>` only when its result is unusable: empty when
output was clearly expected, contradicting its exit code, or garbled.

# CodeGraph

This repo is indexed by CodeGraph (`.codegraph/`). Use it before Read, Grep,
Glob, find or an Explore agent whenever the target is code:

- **Reading a file or symbol**: call `codegraph_explore` with its name or path.
  It returns line-numbered source you can `Edit` from directly, so don't Read
  it again.
- **Finding code** ("where is X", "what calls Y", "how does Z work"): one
  `codegraph_explore` call with a question or the relevant symbol names.
- **Before an edit**: query the symbols you'll change to see their callers and
  blast radius.
- **Tracing a flow**: name the symbols at both ends; it returns the call path.

Trust its results; don't re-check them with grep. Fall back to Read/Grep only
for files CodeGraph doesn't index (config, Markdown, JSON, SQL migrations) or
for a detail its output didn't cover. If the MCP tool is unavailable, run
`codegraph explore "<query>"` in the shell.
<!-- /rtk-instructions -->
