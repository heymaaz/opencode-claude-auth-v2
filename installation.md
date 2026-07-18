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

After the npm package is available, use:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["opencode-claude-auth-v2@latest"],
}
```

Quit and restart OpenCode 2 after changing the configuration.

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
