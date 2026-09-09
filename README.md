# atom-ai

A CLI agent bridge for Atom. Run [opencode](https://opencode.ai), [aider](https://aider.chat), `claude` or any custom CLI coding agent with your editor context — no API keys, no cloud service: the package only drives the agent CLI you already have installed.

## Install

    apm install tmiland-lab/atom-ai

(apm installs straight from GitHub; no package registry needed.)

## Usage

- `ctrl-alt-a` / `Packages → Atom AI → Toggle Panel` — open the AI panel (bottom dock; move it to any dock).
- `ctrl-alt-s` / right-click → *Atom AI: Ask about selection* — attach the active file (and selection) as context and focus the prompt.
- Type a prompt, press `enter` or **Run**. Output streams into the panel.
- **Apply diff** — parses unified diffs (`​```diff` blocks or raw) from the output and applies them to the matching files in the open project. Files must be open in the workspace (undo still works).

## Supported agents

| Agent | Invocation |
| --- | --- |
| `opencode` | `opencode run "<prompt>"` |
| `aider` | `aider --yes-always --message "<prompt>" <files>` |
| `claude` | `claude -p "<prompt>"` |
| `custom` | your command template; the prompt is appended as the last argument |

The agent runs with the project root as its working directory, so it can read
and edit the same files you have open.

## Settings

- **CLI agent** — which of the above to run.
- **Custom command** — command template for the `custom` agent.
- **Extra PATH** — colon-separated directories prepended to `PATH`. Useful
  because Atom launched from the desktop does not inherit your shell's PATH
  (e.g. `/home/you/.local/bin:/usr/local/bin`).

## Requirements

- Atom ≥ 1.0
- At least one supported CLI agent installed and on PATH (or listed in Extra PATH)
- No npm dependencies, no API keys

## License

MIT — see [LICENSE](LICENSE).
