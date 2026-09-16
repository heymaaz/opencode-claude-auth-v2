import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { ProviderEditor } from "@opencode/plugin/promise/provider"
import { configureAnthropicProvider } from "./provider-config.ts"

describe("configureAnthropicProvider", () => {
  it("configures Anthropic through the provider editor", () => {
    const provider = {
      name: "Original",
      integrationID: "original",
      package: "original",
    }
    const model = {
      package: "original",
      cost: [{ input: 1, output: 1 }],
    }
    const models = new Map([["claude-sonnet-4-6", model]])
    const editor = {
      get: (providerID: string) =>
        providerID === "anthropic" ? { provider, models } : undefined,
      update: (
        providerID: string,
        update: (value: typeof provider) => void,
      ) => {
        assert.equal(providerID, "anthropic")
        update(provider)
      },
      models: {
        update: (
          providerID: string,
          modelID: string,
          update: (value: typeof model) => void,
        ) => {
          assert.equal(providerID, "anthropic")
          assert.equal(modelID, "claude-sonnet-4-6")
          update(model)
        },
      },
    } as unknown as ProviderEditor

    configureAnthropicProvider(editor, true)

    assert.equal(provider.name, "Anthropic")
    assert.equal(provider.integrationID, "anthropic")
    assert.match(provider.package, /^aisdk:file:/)
    assert.equal(model.package, provider.package)
    assert.deepEqual(model.cost, [])
  })
})
