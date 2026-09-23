/**
 * OpenCode 2 hands file parts to the provider in the AI SDK v3 shape, where
 * `data` is a base64 string, bytes, or a URL. The bundled `@ai-sdk/anthropic`
 * is a v4 provider and switches on `data.type` (`data` / `url` / `reference` /
 * `text`), so a v3 part matches no case and is dropped without an error: pasted
 * screenshots and images returned by the `read` tool never reach the model.
 *
 * Upgrading those parts before the SDK converts the prompt restores them.
 */

type Json = Record<string, unknown>

const isObject = (value: unknown): value is Json =>
  typeof value === "object" && value !== null

/** Percent-decode to raw bytes; `%FF` is a byte, not a UTF-8 sequence. */
function percentDecode(text: string): Uint8Array {
  const utf8 = new TextEncoder()
  const bytes: number[] = []
  for (let i = 0; i < text.length; i++) {
    const hex = text.slice(i + 1, i + 3)
    if (text[i] === "%" && /^[0-9a-f]{2}$/i.test(hex)) {
      bytes.push(parseInt(hex, 16))
      i += 2
    } else {
      const codePoint = text.codePointAt(i) as number
      const char = String.fromCodePoint(codePoint)
      bytes.push(...utf8.encode(char))
      i += char.length - 1
    }
  }
  return new Uint8Array(bytes)
}

function upgradeData(data: unknown, mediaType: unknown) {
  if (data instanceof URL) return { data: { type: "url", url: data } }
  if (data instanceof Uint8Array) return { data: { type: "data", data } }
  if (data instanceof ArrayBuffer)
    return { data: { type: "data", data: new Uint8Array(data) } }
  if (typeof data === "string") {
    if (/^https?:\/\//i.test(data))
      return { data: { type: "url", url: new URL(data) } }
    const match = /^data:([^;,]+)?((?:;[^;,]*)*),(.*)$/s.exec(data)
    if (match) {
      const [, urlMediaType, params, payload] = match
      // A string payload is read as base64, so a plain (percent-encoded)
      // data URL has to become bytes instead.
      const base64 = params.split(";").includes("base64")
      return {
        data: {
          type: "data",
          data: base64 ? payload : percentDecode(payload),
        },
        mediaType: mediaType ?? urlMediaType,
      }
    }
    return { data: { type: "data", data } }
  }
  return undefined
}

function upgradeFilePart(part: Json): Json {
  if (part.type !== "file") return part
  // Already v4: `data` is a tagged object.
  if (
    isObject(part.data) &&
    !(part.data instanceof URL) &&
    !(part.data instanceof Uint8Array) &&
    !(part.data instanceof ArrayBuffer) &&
    typeof part.data.type === "string"
  )
    return part
  const upgraded = upgradeData(part.data, part.mediaType)
  if (!upgraded) return part
  return {
    ...part,
    data: upgraded.data,
    ...(upgraded.mediaType === undefined
      ? {}
      : { mediaType: upgraded.mediaType }),
  }
}

/** v3 tool-result content parts, mapped onto the v4 `file` part. */
function upgradeToolContentPart(part: Json): Json {
  switch (part.type) {
    case "media":
    case "image-data":
    case "file-data": {
      const { data, mediaType, filename, providerOptions } = part
      return upgradeFilePart({
        type: "file",
        data,
        mediaType,
        ...(filename === undefined ? {} : { filename }),
        ...(providerOptions === undefined ? {} : { providerOptions }),
      })
    }
    case "image-url":
    case "file-url": {
      const { url, mediaType, providerOptions } = part
      return upgradeFilePart({
        type: "file",
        data: url,
        mediaType:
          mediaType ?? (part.type === "image-url" ? "image/*" : undefined),
        ...(providerOptions === undefined ? {} : { providerOptions }),
      })
    }
    default:
      return upgradeFilePart(part)
  }
}

function upgradeToolResult(part: Json): Json {
  if (part.type !== "tool-result" || !isObject(part.output)) return part
  const output = part.output
  if (output.type !== "content" || !Array.isArray(output.value)) return part
  return {
    ...part,
    output: {
      ...output,
      value: output.value.map((item) =>
        isObject(item) ? upgradeToolContentPart(item) : item,
      ),
    },
  }
}

export function upgradePrompt<T>(prompt: T): T {
  if (!Array.isArray(prompt)) return prompt
  return prompt.map((message) => {
    if (!isObject(message) || !Array.isArray(message.content)) return message
    return {
      ...message,
      content: message.content.map((part) =>
        isObject(part) ? upgradeToolResult(upgradeFilePart(part)) : part,
      ),
    }
  }) as T
}

type LanguageModel = {
  doGenerate: (options: Json) => unknown
  doStream: (options: Json) => unknown
}

function wrapModel<M>(model: M): M {
  const target = model as unknown as LanguageModel
  const doGenerate = target.doGenerate.bind(target)
  const doStream = target.doStream.bind(target)
  target.doGenerate = (options) =>
    doGenerate({ ...options, prompt: upgradePrompt(options.prompt) })
  target.doStream = (options) =>
    doStream({ ...options, prompt: upgradePrompt(options.prompt) })
  return model
}

const MODEL_FACTORIES = ["languageModel", "chat", "messages"] as const

/** Wrap every language-model factory of an `@ai-sdk/anthropic` provider. */
export function withPromptCompat<P extends (...args: never[]) => unknown>(
  provider: P,
): P {
  const call = (...args: Parameters<P>) => wrapModel(provider(...args))
  const wrapped = Object.assign(call, provider) as unknown as Json
  for (const name of MODEL_FACTORIES) {
    const factory = (provider as unknown as Json)[name]
    if (typeof factory === "function")
      wrapped[name] = (...args: unknown[]) =>
        wrapModel(factory.apply(provider, args))
  }
  return wrapped as unknown as P
}
