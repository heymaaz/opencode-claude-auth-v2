# opencode-claude-auth-v2

Use an existing Claude Code Pro or Max subscription in the OpenCode 2 beta.

This is an OpenCode 2-only fork of
[`griffinmartin/opencode-claude-auth`](https://github.com/griffinmartin/opencode-claude-auth). Use Griffin's package for
OpenCode 1.

> OpenCode 2 and its plugin API are in beta. This package currently targets
> `@opencode-ai/cli@0.0.0-next-15788` and may require updates with later beta builds.

## How It Works

The plugin:

- discovers Claude Code credentials in the macOS Keychain or `~/.claude/.credentials.json`;
- registers a native OpenCode 2 OAuth Integration;
- creates a separate **Claude Subscription** provider so normal Anthropic API-key configuration remains untouched;
- copies the current Anthropic model catalog into that provider;
- routes requests through the AI SDK Anthropic provider with Claude subscription bearer authentication;
- preserves OpenCode's own tools and permission loop;
- refreshes expiring OAuth credentials and writes rotated tokens back to their original source;
- applies the request, billing, beta-header, tool-name, and streaming transformations inherited from the original plugin.

The separate provider is intentional. OpenCode 2's native Anthropic route currently sends every resolved credential as an
`x-api-key`; Claude subscription OAuth requires bearer authentication and additional request transformations.

## Requirements

- Node.js 22 or newer
- `@opencode-ai/cli@next`
- Claude Code installed and authenticated with `claude auth login`
- A Claude Pro or Max subscription

## Install

Until the first npm release, load the local checkout explicitly:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    "/absolute/path/to/opencode-claude-auth-v2/opencode-claude-auth.js",
  ],
}
```

Build it first:

```bash
pnpm install
pnpm build
```

After publication, the configuration will be:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["opencode-claude-auth-v2@latest"],
}
```

Restart OpenCode 2 after changing plugin configuration.

## Use

Start OpenCode 2 and select a model from the **Claude Subscription** provider:

```bash
opencode2
```

Run `/connect` once and choose **Claude Subscription > Import Claude Code subscription**. You can repeat that flow to
replace the stored connection or switch Claude Code accounts.

OpenCode 1's singular `plugin` field is not supported. OpenCode 2 uses the plural `plugins` field.

## Why Not `ai-sdk-provider-claude-code`?

That community provider runs the Claude Agent SDK as its own agent harness. Its AI SDK v6 implementation does not support
application-provided custom tools. OpenCode needs model tool calls returned to its own permissioned tool loop, so this plugin
uses `@ai-sdk/anthropic` with a custom transport instead.

## Credential Sources

1. macOS Keychain entries named `Claude Code-credentials*`
2. `~/.claude/.credentials.json`

Multiple macOS accounts appear as choices in the OpenCode 2 connection flow. The selected source is persisted locally.

## Development

```bash
pnpm install
pnpm build
pnpm test
pnpm lint
```

Diagnostic logging can be enabled with `CLAUDE_AUTH_DEBUG=1` or set to a file path:

```bash
CLAUDE_AUTH_DEBUG=/tmp/claude-auth-debug.log opencode2
```

## Attribution

This repository preserves the history and MIT-licensed implementation of
[`griffinmartin/opencode-claude-auth`](https://github.com/griffinmartin/opencode-claude-auth). The OpenCode 2 integration
architecture follows the public provider-plugin patterns in
[`anomalyco/opencode`](https://github.com/anomalyco/opencode), particularly its GitHub Copilot provider.

## Disclaimer

OpenCode's documentation states that Anthropic does not permit Claude Pro or Max subscription use through third-party
plugins. This project is unofficial, may stop working when Anthropic changes its OAuth infrastructure, and should be used
at your own discretion.

## License

MIT
