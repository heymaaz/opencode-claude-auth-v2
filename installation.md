# Install opencode-claude-auth-v2

These instructions target OpenCode 2 only.

## Prerequisites

```bash
opencode2 --version
claude auth login
```

OpenCode 2 is currently installed with:

```bash
npm install -g @opencode-ai/cli@next
```

## Local Checkout

Build this repository:

```bash
pnpm install
pnpm build
```

Add its absolute entrypoint to `~/.config/opencode/opencode.json`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    "/absolute/path/to/opencode-claude-auth-v2/opencode-claude-auth.js",
  ],
}
```

## Published Package

Use:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["opencode-claude-auth-v2@latest"],
}
```

Quit and restart OpenCode 2 after changing the configuration.

## Migrating from OpenCode 1

Replace the OpenCode 1 configuration:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-claude-auth@latest"],
}
```

with the OpenCode 2 configuration:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["opencode-claude-auth-v2@latest"],
}
```

The changes are both required: OpenCode 2 uses `plugins` instead of `plugin`, and the original package only supports
OpenCode 1.

The old plugin connection is not reused by the OpenCode 2 integration. Run `claude auth login` if Claude Code is not already
signed in, restart OpenCode 2, then run `/connect` and choose **Anthropic > Import Claude Code subscription**. Existing
Claude Code credentials in the macOS Keychain, `~/.claude/.credentials.json`, or `$CLAUDE_CONFIG_DIR/.credentials.json` can
be imported without another browser login.

Change explicit model references from `anthropic/<model>` to `claude-subscription/<model>`. Use `/models` to select a model
under **Claude Subscription**.

## Running OpenCode 1 and 2 Side by Side

OpenCode 1 rejects the OpenCode 2 `plugins` field, so both plugin entries cannot coexist in one configuration file. Leave the
existing OpenCode 1 config at `~/.config/opencode/opencode.json` and create an isolated OpenCode 2 config root:

```bash
mkdir -p "$HOME/.config/opencode-v2/opencode"
```

Create `~/.config/opencode-v2/opencode/opencode.json` with:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["opencode-claude-auth-v2@latest"],
}
```

Add an alias to `~/.zshrc` or `~/.bashrc`:

```bash
alias oc2='XDG_CONFIG_HOME="$HOME/.config/opencode-v2" XDG_DATA_HOME="$HOME/.local/share/opencode-v2" XDG_STATE_HOME="$HOME/.local/state/opencode-v2" XDG_CACHE_HOME="$HOME/.cache/opencode-v2" opencode2'
```

Restart the shell. Continue using `opencode` for OpenCode 1 and use `oc2` for the isolated OpenCode 2 installation. `HOME`
remains unchanged, so Claude Code credentials in the Keychain or `~/.claude/.credentials.json` remain available to the v2
plugin.

Both versions still discover project-level `opencode.json` files. Keep version-specific `plugin` and `plugins` entries in
their separate global configurations while running the two versions side by side.

## Verify

```bash
opencode2 plugin list
```

The list should contain:

```text
heymaaz.claude-auth-v2
```

In the TUI, run `/connect`, select **Claude Subscription**, and choose **Import Claude Code subscription**. Then use
`/models` and choose a model under **Claude Subscription**.

For loader failures, inspect `~/.local/share/opencode/log/opencode.log` or run with `OPENCODE_LOG_LEVEL=DEBUG`.
