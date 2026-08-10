import {
  Credential,
  Integration,
  Plugin,
  Provider,
} from "@opencode-ai/plugin/effect"
import type { IntegrationOAuthMethodRegistration } from "@opencode-ai/plugin/effect/integration"
import { Effect } from "effect"
import {
  getCachedCredentials,
  initAccounts,
  loadPersistedAccountSource,
  refreshAccountsList,
  refreshViaOAuth,
  saveAccountSource,
  setActiveAccountSource,
} from "./credentials.ts"
import { readAllClaudeAccounts, writeBackCredentials } from "./keychain.ts"
import { initLogger, log } from "./logger.ts"

export * from "./betas.ts"
export * from "./credentials.ts"
export * from "./provider.ts"
export * from "./signing.ts"
export * from "./transforms.ts"

const PROVIDER_ID = Provider.ID.make("claude-subscription")
const INTEGRATION_ID = Integration.ID.make("anthropic")
const METHOD_ID = Integration.MethodID.make("claude-code")
const SYSTEM_IDENTITY =
  "You are Claude Code, Anthropic's official CLI for Claude."
const PROVIDER_PACKAGE = `aisdk:${new URL("./provider.js", import.meta.url).href}`

interface ModelsDevModel {
  id: string
  name: string
  family?: string
  tool_call?: boolean
  release_date?: string
  status?: "alpha" | "beta" | "deprecated" | "active"
  modalities?: { input?: string[]; output?: string[] }
  limit: { context: number; input?: number; output: number }
  reasoning_options?: Array<{ type: string; values?: string[] }>
}

async function loadAnthropicModels() {
  const response = await fetch("https://models.dev/api.json", {
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok)
    throw new Error(`models.dev returned HTTP ${response.status}`)
  const data = (await response.json()) as {
    anthropic?: { models?: Record<string, ModelsDevModel> }
  }
  return Object.values(data.anthropic?.models ?? {})
}

async function credential(source: string) {
  const accounts = refreshAccountsList()
  const account = accounts.find((item) => item.source === source) ?? accounts[0]
  if (!account)
    throw new Error(
      "No Claude Code credentials found. Run `claude` to authenticate first.",
    )
  setActiveAccountSource(account.source)
  saveAccountSource(account.source)
  const value = (await getCachedCredentials()) ?? account.credentials
  return Credential.OAuth.make({
    type: "oauth",
    methodID: METHOD_ID,
    access: value.accessToken,
    refresh: value.refreshToken,
    expires: value.expiresAt,
    metadata: {
      source: account.source,
      label: account.label,
      ...(account.configDir ? { configDir: account.configDir } : {}),
      ...(value.subscriptionType
        ? { subscriptionType: value.subscriptionType }
        : {}),
    },
  })
}

function oauth(accounts: ReturnType<typeof readAllClaudeAccounts>) {
  return {
    integrationID: INTEGRATION_ID,
    method: {
      id: METHOD_ID,
      type: "oauth",
      label: "Import Claude Code subscription",
      ...(accounts.length <= 1
        ? {}
        : {
            prompts: [
              {
                type: "select" as const,
                key: "account",
                message: "Select a Claude Code account",
                options: accounts.map((account) => ({
                  label: account.label,
                  value: account.source,
                  hint: account.source,
                })),
              },
            ],
          }),
    },
    authorize: (inputs) =>
      Effect.tryPromise({
        try: async () => {
          const latest = refreshAccountsList()
          const source =
            (typeof inputs.account === "string" ? inputs.account : undefined) ??
            loadPersistedAccountSource() ??
            latest[0]?.source ??
            accounts[0]?.source
          if (!source)
            throw new Error(
              "No Claude Code credentials found. Run `claude` to authenticate first.",
            )
          const value = await credential(source)
          return {
            mode: "auto" as const,
            url: "",
            instructions: "Claude Code credentials imported from this device.",
            callback: Effect.succeed(value),
          }
        },
        catch: (cause) => cause,
      }),
    refresh: (value) =>
      Effect.tryPromise({
        try: async () => {
          const refreshed = await refreshViaOAuth(value.refresh)
          if (!refreshed)
            throw new Error(
              "Claude OAuth refresh failed. Run `claude` to re-authenticate.",
            )
          const source =
            typeof value.metadata?.source === "string"
              ? value.metadata.source
              : undefined
          const configDir =
            typeof value.metadata?.configDir === "string"
              ? value.metadata.configDir
              : undefined
          if (source)
            writeBackCredentials(source, refreshed, configDir, value.access)
          return Credential.OAuth.make({
            ...value,
            methodID: METHOD_ID,
            access: refreshed.accessToken,
            refresh: refreshed.refreshToken,
            expires: refreshed.expiresAt,
          })
        },
        catch: (cause) => cause,
      }),
    label: (value) =>
      typeof value.metadata?.label === "string"
        ? value.metadata.label
        : undefined,
  } satisfies IntegrationOAuthMethodRegistration
}

export const ClaudeAuthPlugin = Plugin.define({
  id: "heymaaz.claude-auth-v2",
  effect: Effect.fn(function* (ctx) {
    initLogger()
    const accounts = yield* Effect.try({
      try: readAllClaudeAccounts,
      catch: (cause) => cause,
    }).pipe(
      Effect.catch((cause) =>
        Effect.sync(() => {
          log("plugin_init_error", { cause: String(cause) })
          return []
        }),
      ),
    )
    initAccounts(accounts)
    const selected = loadPersistedAccountSource() ?? accounts[0]?.source
    if (selected) setActiveAccountSource(selected)

    yield* ctx.integration.transform((draft) => {
      draft.update(INTEGRATION_ID, (integration) => {
        integration.name = "Anthropic"
      })
      draft.method.update(oauth(accounts))
    })

    const models = yield* Effect.tryPromise({
      try: loadAnthropicModels,
      catch: (cause) => cause,
    }).pipe(
      Effect.catch((cause) =>
        Effect.sync(() => {
          log("models_dev_error", { cause: String(cause) })
          return []
        }),
      ),
    )
    yield* ctx.catalog.transform((catalog) => {
      catalog.provider.update(PROVIDER_ID, (provider) => {
        provider.name = "Claude Subscription"
        provider.integrationID = INTEGRATION_ID
        provider.package = PROVIDER_PACKAGE
      })
      for (const source of models) {
        catalog.model.update(PROVIDER_ID, source.id, (model) => {
          Object.assign(model, {
            id: source.id,
            modelID: source.id,
            providerID: PROVIDER_ID,
            family: source.family,
            name: source.name,
            package: PROVIDER_PACKAGE,
            capabilities: {
              tools: source.tool_call ?? true,
              input: source.modalities?.input ?? ["text"],
              output: source.modalities?.output ?? ["text"],
            },
            variants:
              source.reasoning_options
                ?.flatMap((option) => option.values ?? [])
                .map((effort) => ({
                  id: effort,
                  settings: {
                    thinking: { type: "adaptive", display: "summarized" },
                    effort,
                  },
                })) ?? [],
            time: {
              released: source.release_date
                ? Date.parse(`${source.release_date}T00:00:00Z`)
                : 0,
            },
            cost: [],
            status: source.status ?? "active",
            enabled: source.status !== "deprecated",
            limit: source.limit,
          })
        })
      }
    })

    yield* ctx.session.hook("context", (event) =>
      Effect.sync(() => {
        if (event.model.providerID !== PROVIDER_ID) return
        if (event.system.some((part) => part.text.includes(SYSTEM_IDENTITY)))
          return
        event.system.unshift({ type: "text", text: SYSTEM_IDENTITY })
      }),
    )

    if (accounts.length === 0) {
      log("plugin_init_no_accounts", { reason: "no credentials found" })
      return
    }
    log("plugin_init", {
      accountCount: accounts.length,
      sources: accounts.map((account) => account.source),
    })
  }),
})

export default ClaudeAuthPlugin
