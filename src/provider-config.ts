import { Provider } from "@opencode/plugin"
import type { ProviderEditor } from "@opencode/plugin/promise/provider"
import { INTEGRATION_ID } from "./oauth-method.ts"

export const PROVIDER_ID: string = Provider.ID.make("anthropic")
const PROVIDER_PACKAGE = `aisdk:${new URL("./provider.js", import.meta.url).href}`

export function configureAnthropicProvider(
  editor: ProviderEditor,
  subscription: boolean,
): void {
  const anthropic = editor.get(PROVIDER_ID)
  if (!anthropic) return
  editor.update(PROVIDER_ID, (provider) => {
    provider.name = "Anthropic"
    provider.integrationID = INTEGRATION_ID
    provider.package = PROVIDER_PACKAGE
  })
  for (const [modelID] of anthropic.models) {
    editor.models.update(PROVIDER_ID, modelID, (model) => {
      model.package = PROVIDER_PACKAGE
      if (subscription) model.cost = []
    })
  }
}
