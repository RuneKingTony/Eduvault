# Herdr command reference

Captured directly from the installed binary's usage lines (not guessed). Read this when a workflow
pattern in SKILL.md doesn't cover the flag or subcommand you need.

## Panes — `herdr pane <cmd>`

| Cmd                        | Usage                                                                                                                     | Notes                                                                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `split`                    | `split [<pane_id>\|--pane ID\|--current] --direction right\|down [--ratio F] [--cwd P] [--env K=V] [--focus\|--no-focus]` | Binary only — `direction`+`ratio`. No 3×3 grid primitive; build one by splitting repeatedly. Returns `.result.pane.pane_id`. |
| `run`                      | `run <PANE_ID> <COMMAND>...`                                                                                              | Atomically sends text + Enter.                                                                                               |
| `send-text`                | `send-text <PANE_ID> <TEXT>`                                                                                              | Text only, no Enter.                                                                                                         |
| `send-keys`                | `send-keys <PANE_ID> <KEY>...`                                                                                            | Logical key names; canonical Escape is `esc` (`escape` also accepted), e.g. `ctrl+c`.                                        |
| `list`                     | `list [--workspace ID]`                                                                                                   |                                                                                                                              |
| `current`                  | `current [--pane ID\|--current]`                                                                                          |                                                                                                                              |
| `get`                      | `get <pane_id>`                                                                                                           |                                                                                                                              |
| `close`                    | `close <pane_id>`                                                                                                         | Never close a pane you didn't create unless explicitly asked.                                                                |
| `focus`                    | `focus --direction left\|right\|up\|down [--pane ID\|--current]`                                                          | Focus the neighbor in a direction.                                                                                           |
| `neighbor`                 | `neighbor --direction left\|right\|up\|down [--pane ID\|--current]`                                                       | Just looks up the neighbor, doesn't focus it.                                                                                |
| `resize`                   | `resize --direction left\|right\|up\|down [--amount F] [--pane ID\|--current]`                                            |                                                                                                                              |
| `zoom`                     | `zoom [<pane_id>] [--pane ID\|--current] [--toggle\|--on\|--off]`                                                         |                                                                                                                              |
| `read`                     | `read <PANE_ID> [--source visible\|recent\|recent-unwrapped\|detection] [--lines N] [--format text\|ansi] [--raw]`        | See source guidance below.                                                                                                   |
| `wait-output`              | `wait-output <PANE_ID> (--match TEXT\|--regex PATTERN) [--source ...] [--lines N] [--timeout MS] [--raw]`                 | Searches existing output immediately, then polls. No `--timeout` = waits forever.                                            |
| `layout`                   | `layout [--pane ID\|--current]`                                                                                           | Inspect split geometry before deciding split direction.                                                                      |
| `edges`                    | `edges [--pane ID\|--current]`                                                                                            |                                                                                                                              |
| `swap` / `move` / `rename` |                                                                                                                           |                                                                                                                              |

**Read `--source` choices:** `visible` (rendered viewport only), `recent` (rendered output incl.
soft wraps), `recent-unwrapped` (soft wraps joined — best for logs/transcripts), `detection`
(plain-text bottom-buffer snapshot used for agent-state detection). Use `--format ansi` only when
color/styling is itself the evidence.

If a bigger `--lines` doesn't reveal more of a finished response, the pane is on the terminal's
alternate screen (e.g. an interactive TUI) — those rows never reach Herdr's host scrollback. Fallback:
ask the agent in that pane to write its answer to a temp file and read the file directly; don't
request file output pre-emptively.

## Tabs — `herdr tab <cmd>`

| Cmd               | Usage                                                                                                                  |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `create`          | `create [--workspace ID] [--cwd P] [--label X] [--env K=V] [--focus\|--no-focus]` → `.result.tab`, `.result.root_pane` |
| `list`            | `list [--workspace ID]`                                                                                                |
| `focus` / `close` | `<tab_id>`                                                                                                             |
| `rename`          |                                                                                                                        |

## Workspaces — `herdr workspace <cmd>`

| Cmd                                  | Usage                                                                                                                      |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `create`                             | `create [--cwd P] [--label X] [--env K=V] [--focus\|--no-focus]` → `.result.workspace`, `.result.tab`, `.result.root_pane` |
| `list`                               | `list`                                                                                                                     |
| `focus` / `close`                    | `<workspace_id>`                                                                                                           |
| `get` / `rename` / `report-metadata` |                                                                                                                            |

## Worktrees — `herdr worktree <cmd>`

| Cmd                        | Usage                                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `create`                   | `create [--workspace ID] [--cwd P] [--branch NAME] [--base REF] [--path P] [--label X] [--focus\|--no-focus]` |
| `list` / `open` / `remove` |                                                                                                               |

## Agents — `herdr agent <cmd>`

Agent commands target either a **unique live agent name** or the **pane ID** currently hosting it —
never a terminal ID or a bare kind label. Names match `[a-z][a-z0-9_-]{0,31}`, are unique among live
agents, and are cleared when that agent exits, is released, or is replaced.

Lifecycle states: `idle` (ready for input, tab has been seen in the focused UI), `working`, `blocked`
(Herdr recognized an approval/question UI), `done` (idle after unseen background work finished),
`unknown` (present but not confidently classified — not proof of completion). CLI reads don't mark a
tab "seen"; only focusing it or targeting it with a focus command does.

| Cmd                                             | Usage                                                                                            | Notes                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `start`                                         | `start <NAME> --kind <KIND> --pane <ID> [--timeout MS] [-- <AGENT_ARG>...]`                      | Pane must already be at an interactive shell prompt — nothing running in the foreground. `--kind` one of: `pi, claude, codex, gemini, cursor, devin, agy, cline, omp, mastracode, opencode, copilot, kimi, kiro, droid, amp, grok, hermes, kilo, qodercli, maki`. Default timeout 30000ms (max 300000). Never creates/splits/moves panes itself.                |
| `prompt`                                        | `prompt <TARGET> <TEXT> [--wait] [--until idle\|working\|blocked\|done\|unknown] [--timeout MS]` | Atomically submits text + Enter, honoring bracketed-paste. `--wait` alone is enough for normal work — waits for the first `idle`/`done`/`blocked`. From a non-working state it needs an observed lifecycle change within 5s or returns `agent_prompt_stalled`. Doesn't track individual turns — an already-working agent's in-flight turn can satisfy the wait. |
| `wait`                                          | `wait <TARGET> [--until ...] [--timeout MS]`                                                     | Same defaults as `prompt --wait`. Use `--until blocked` to catch an agent that's about to ask a question.                                                                                                                                                                                                                                                       |
| `send-keys`                                     | `send-keys <TARGET> <KEY>...`                                                                    | Validated before any bytes are written, e.g. `esc`, `ctrl+c`.                                                                                                                                                                                                                                                                                                   |
| `read`                                          | same shape as `pane read`, targeted by agent name/pane                                           |                                                                                                                                                                                                                                                                                                                                                                 |
| `list` / `get` / `rename` / `focus` / `explain` |                                                                                                  |                                                                                                                                                                                                                                                                                                                                                                 |
| `attach`                                        | `attach <TARGET> [--takeover]`                                                                   |                                                                                                                                                                                                                                                                                                                                                                 |

## Sessions / server / misc

- `herdr session list|attach <name>|stop <n>|delete <n>`
- `herdr server stop` / `herdr server reload-config` — **never** stop the server from an active
  session unless the user explicitly wants the server and all its panes killed.
- `herdr status [server|client]`, `herdr --version`, `herdr update`
- `herdr --default-config` prints full default config, including default keybindings. Merge with
  `~/.config/herdr/config.toml`'s `[keys]` section for the live effective bindings — see SKILL.md's
  "Keybindings" section.
- `herdr --skill` prints Herdr's own bundled agent instructions — the authoritative fallback if
  SKILL.md and the live binary ever disagree (the binary always wins).
