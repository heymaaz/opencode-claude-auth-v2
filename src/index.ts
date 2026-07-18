import {
  Credential,
  Integration,
  Plugin,
  Provider,
} from "@opencode-ai/plugin/v2/effect"
import type { IntegrationOAuthMethodRegistration } from "@opencode-ai/plugin/v2/effect/integration"
import { Effect } from "effect"
import {
  getCachedCredentials,
  initAccounts,
  loadPersistedAccountSource,
  refreshAccountsList,
  refreshViaOAuthAsync,
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
const INTEGRATION_ID = Integration.ID.make("claude-subscription")
const METHOD_ID = Integration.MethodID.make("claude-code")
const SYSTEM_IDENTITY =
  "You are Claude Code, Anthropic's official CLI for Claude."
const PROVIDER_PACKAGE = `aisdk:${new URL("./provider.js", import.meta.url).href}`

function credential(source: string) {
  const accounts = refreshAccountsList()
  const account = accounts.find((item) => item.source === source) ?? accounts[0]
  if (!account)
    throw new Error(
      "No Claude Code credentials found. Run `claude` to authenticate first.",
    )
  setActiveAccountSource(account.source)
  saveAccountSource(account.source)
  const value = getCachedCredentials() ?? account.credentials
  return Credential.OAuth.make({
    type: "oauth",
    methodID: METHOD_ID,
    access: value.accessToken,
    refresh: value.refreshToken,
    expires: value.expiresAt,
    metadata: {
      source: account.source,
      label: account.label,
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
      Effect.try(() => {
        const latest = refreshAccountsList()
        const source =
          inputs.account ??
          loadPersistedAccountSource() ??
          latest[0]?.source ??
          accounts[0]?.source
        if (!source)
          throw new Error(
            "No Claude Code credentials found. Run `claude` to authenticate first.",
          )
        const value = credential(source)
        return {
          mode: "auto" as const,
          url: "",
          instructions: "Claude Code credentials imported from this device.",
          callback: Effect.succeed(value),
        }
      }),
    refresh: (value) =>
      Effect.tryPromise({
        try: async () => {
          const refreshed = await refreshViaOAuthAsync(value.refresh)
          if (!refreshed)
            throw new Error(
              "Claude OAuth refresh failed. Run `claude` to re-authenticate.",
            )
          const source =
            typeof value.metadata?.source === "string"
              ? value.metadata.source
              : undefined
          if (source) writeBackCredentials(source, refreshed)
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
        integration.name = "Claude Subscription"
      })
      draft.method.update(oauth(accounts))
    })

    yield* ctx.catalog.transform((catalog) => {
      const anthropic = catalog.provider.get("anthropic")
      if (!anthropic) return
      catalog.provider.update(PROVIDER_ID, (provider) => {
        provider.name = "Claude Subscription"
        provider.integrationID = INTEGRATION_ID
        provider.package = PROVIDER_PACKAGE
        provider.settings = { ...anthropic.provider.settings }
      })
      for (const [id, source] of anthropic.models) {
        catalog.model.update(PROVIDER_ID, id, (model) => {
          Object.assign(model, structuredClone(source), {
            providerID: PROVIDER_ID,
            package: PROVIDER_PACKAGE,
            cost: [],
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
