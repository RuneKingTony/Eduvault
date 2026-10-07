---
name: herdr
description: Control Herdr, the terminal multiplexer this session runs in — split/resize/focus panes, create tabs and workspaces, start and drive other coding agents in sibling panes, read pane output, and look up current keybindings from config. Use only when the user explicitly mentions Herdr, panes, splits, tabs, or workspaces, or asks to delegate work to another agent pane. Do not use merely because a task could benefit from a background terminal. Requires `HERDR_ENV=1`.
license: MIT
metadata:
  version: '1.0'
---

# Herdr

Herdr is the terminal workspace manager this session may be running inside (herdr.dev). It
organizes terminals into **workspaces → tabs → panes**, recognizes coding agents running inside
panes, and exposes everything through the `herdr` CLI. This skill exists so you never have to ask
"what is herdr" again — the reference below is enough to act directly.

## Before anything: confirm you're inside Herdr

```bash
test "${HERDR_ENV:-}" = 1
```

If that fails, say you are not running inside Herdr and stop — do not try to inspect or control a
Herdr session from outside it.

When it passes, these env vars are already injected into your pane — use them instead of guessing
IDs:

```bash
echo "$HERDR_WORKSPACE_ID" "$HERDR_TAB_ID" "$HERDR_PANE_ID" "$HERDR_SESSION" "$HERDR_SOCKET_PATH"
```

## When this file doesn't have it

Check, in order:

1. `herdr <group>` (no subcommand, e.g. `herdr pane`) — lists that group's commands.
2. `herdr <group> <cmd> -h` — usage for one command. Nested `--help`/`-h` is unreliable on this
   build; it sometimes falls back to top-level help. If so, run the command with a clearly-wrong or
   missing arg (read-only commands only) to force its usage line.
3. `herdr --default-config` — full default config, including every default keybinding.
4. `herdr --skill` — Herdr's own bundled agent instructions. Authoritative fallback if this file and
   the live binary disagree; the binary always wins.
5. `herdr api schema` / `herdr api snapshot` — socket API schema and live runtime state.
6. `docs/app_bootstrap/herdr-rewrite.md` in this repo — design notes on the CLI rewrite.
7. **https://herdr.dev** — live docs site. Fetch this last, only once 1–6 don't answer the question
   (e.g. conceptual questions, install/update, integrations, anything not covered by the CLI itself).

## IDs

Public IDs are opaque, stable, three-level handles and are never reused once closed:

- workspace: `w1`
- tab: `w1:t1`
- pane: `w1:p1`

Always read the next ID out of a command's JSON response — never guess from sidebar order or from
examples in this file. Creation responses carry them forward:

- `workspace create` → `.result.workspace`, `.result.tab`, `.result.root_pane`
- `tab create` → `.result.tab`, `.result.root_pane`
- `pane split` → `.result.pane` (`.pane_id` is what you pass to the next call)

After `pane move`, the pane gets a new workspace-qualified ID at
`.result.move_result.pane.pane_id`; the old ID (`.result.move_result.previous_pane_id`) only keeps
resolving for the moved process's own inherited context — don't reuse it as a general target.

`--current` targets the calling pane and is preferred whenever a command should act on "this pane" —
omitting a target can fall back to whatever pane the UI happens to have focused, which may belong to
the user or another client.

## Discover live state

```bash
herdr workspace list
herdr tab list --workspace "$HERDR_WORKSPACE_ID"
herdr pane current --current
herdr pane list --workspace "$HERDR_WORKSPACE_ID"
herdr agent list
```

## Command reference

Full pane/tab/workspace/worktree/agent/session command tables, captured directly from the installed
binary: **`references/command-reference.md`**. Read it before running any command not shown in the
workflow patterns below.

## Workflow patterns

**Split a sibling pane for background work, preserving the caller's focus and cwd:**

```bash
herdr pane split --current --direction right --cwd "$PWD" --no-focus
# -> read .result.pane.pane_id
```

Use `right` for a wide pane, `down` for a narrow/tall one — check `herdr pane layout --current`
first rather than guessing, and avoid repeated same-direction splits that produce unusably thin
columns/rows. Default to a sibling pane in the _current_ tab at the _current_ cwd; only create a new
tab/workspace/worktree or change cwd when the user explicitly asks for that topology.

**Run and observe an ordinary command in that pane:**

```bash
herdr pane run <pane_id> "just test"
herdr pane wait-output <pane_id> --match "test result" --timeout 120000
herdr pane read <pane_id> --source recent-unwrapped --lines 120
```

**Start and drive another coding agent in a sibling pane:**

```bash
herdr pane split --current --direction right --cwd "$PWD" --no-focus   # -> <pane_id>
herdr agent start reviewer --kind codex --pane <pane_id>
herdr agent prompt reviewer "Review the current diff and report only actionable findings." --wait --timeout 120000
herdr agent get reviewer
herdr agent read reviewer --source recent-unwrapped --lines 120
```

Start only the agents the user asked for; one unless they named more. A pane agent costs a whole
model session and a terminal the user can see, so do not start one for work you can finish yourself
in a handful of tool calls, and never start one to check another agent's work.

If a wait returns `blocked`, the agent is sitting on an approval or question UI
(`references/command-reference.md`, lifecycle states). Read it with `agent get` + `agent read` and
report the prompt text to the user. Never send keys or a prompt that answers it — that approves
another agent's action in the user's name. Wait for the user to say what to send. If the wait merely
fails, inspect `agent get` + `agent read` before deciding what to send next.

**Split one pane into 3 vertical panes** (Herdr splits are binary, so do it in two steps):

```bash
herdr pane split <id> --direction right --ratio 0.667 --no-focus   # new pane = right third
herdr pane split <id> --direction right --ratio 0.5   --no-focus   # remaining half splits into two thirds
```

## Safety rules

- `--no-focus` for anything the user didn't ask to switch context to.
- Target with `--current`, an explicit pane ID, or a unique agent name — never rely on "whatever
  pane the UI has focused," which may be the user's.
- Parse every ID from JSON output; don't derive from sidebar order or from examples here.
- Don't close, stop, delete or take over a workspace, tab, pane, session, worktree or agent you
  didn't create unless explicitly asked. This covers `pane close`, `tab close`, `workspace close`,
  `worktree remove`, `session stop`, `session delete` and `agent attach --takeover`.
- Don't send input to a pane or agent you didn't create. `pane run`, `pane send-text`,
  `pane send-keys`, `agent prompt` and `agent send-keys` all type into someone's live session. Use
  them only on a pane you split yourself or an agent you started, or when the user names the
  target. Reads (`pane read`, `agent read`, `agent get`) are always safe.
- Never run `herdr server stop` or kill the main Herdr process from inside an active session
  unless the user explicitly wants the server (and its pane processes) stopped. Use a named test
  session (`--session <name>`) for throwaway experiments instead.
- CLI errors: server-side errors are JSON on stderr with exit status 1; syntax errors exit 2.

## Keybindings — always read live, never memorize

Keybindings are user-configurable and drift from any table written into this file. Answer keybinding
questions by reading, in order:

1. `cat ~/.config/herdr/config.toml` — the `[keys]` section holds every binding the user has
   overridden. Its `prefix` line (default `"ctrl+b"`) applies to every `prefix+X` action below it.
2. `herdr --default-config` — same `[keys]` shape, commented out, showing the shipped default for
   every action not present in step 1. A binding missing from both is unset (no key).

Merge the two: config.toml's explicit values win; everything else falls back to the default-config
value.
