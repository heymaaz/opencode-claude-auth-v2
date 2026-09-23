import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { createAnthropic } from "@ai-sdk/anthropic"
import { upgradePrompt, withPromptCompat } from "./prompt-compat.ts"

const PNG_BASE64 = "iVBORw0KGgo="

describe("upgradePrompt", () => {
  it("wraps a base64 string file part as v4 data", () => {
    const [message] = upgradePrompt([
      {
        role: "user",
        content: [{ type: "file", mediaType: "image/png", data: PNG_BASE64 }],
      },
    ]) as { content: unknown[] }[]
    assert.deepEqual(message.content[0], {
      type: "file",
      mediaType: "image/png",
      data: { type: "data", data: PNG_BASE64 },
    })
  })

  it("wraps bytes, URL objects and http(s) strings", () => {
    const bytes = new Uint8Array([1, 2, 3])
    const url = new URL("https://example.com/a.png")
    const [message] = upgradePrompt([
      {
        role: "user",
        content: [
          { type: "file", mediaType: "image/png", data: bytes },
          { type: "file", mediaType: "image/png", data: url },
          {
            type: "file",
            mediaType: "image/png",
            data: "https://example.com/b.png",
          },
        ],
      },
    ]) as { content: { data: unknown }[] }[]
    assert.deepEqual(message.content[0].data, { type: "data", data: bytes })
    assert.deepEqual(message.content[1].data, { type: "url", url })
    assert.deepEqual(message.content[2].data, {
      type: "url",
      url: new URL("https://example.com/b.png"),
    })
  })

  it("unpacks a data: URL and fills in a missing media type", () => {
    const [message] = upgradePrompt([
      {
        role: "user",
        content: [
          { type: "file", data: `data:image/png;base64,${PNG_BASE64}` },
        ],
      },
    ]) as { content: unknown[] }[]
    assert.deepEqual(message.content[0], {
      type: "file",
      mediaType: "image/png",
      data: { type: "data", data: PNG_BASE64 },
    })
  })

  it("wraps an ArrayBuffer as v4 bytes", () => {
    const buffer = new Uint8Array([1, 2, 3]).buffer
    const [message] = upgradePrompt([
      {
        role: "user",
        content: [{ type: "file", mediaType: "image/png", data: buffer }],
      },
    ]) as { content: { data: unknown }[] }[]
    assert.deepEqual(message.content[0].data, {
      type: "data",
      data: new Uint8Array([1, 2, 3]),
    })
  })

  it("decodes a percent-encoded data: URL to bytes, not base64", () => {
    const [message] = upgradePrompt([
      {
        role: "user",
        content: [
          { type: "file", data: "data:image/svg+xml,%3Csvg%3E%FF%3C/svg%3E" },
        ],
      },
    ]) as { content: { mediaType: string; data: unknown }[] }[]
    assert.equal(message.content[0].mediaType, "image/svg+xml")
    assert.deepEqual(message.content[0].data, {
      type: "data",
      data: new Uint8Array([
        ...new TextEncoder().encode("<svg>"),
        0xff,
        ...new TextEncoder().encode("</svg>"),
      ]),
    })
  })

  it("keeps the base64 payload of a data: URL with extra parameters", () => {
    const [message] = upgradePrompt([
      {
        role: "user",
        content: [
          {
            type: "file",
            data: `data:image/png;name=a.png;base64,${PNG_BASE64}`,
          },
        ],
      },
    ]) as { content: { data: unknown }[] }[]
    assert.deepEqual(message.content[0].data, {
      type: "data",
      data: PNG_BASE64,
    })
  })

  it("leaves v4 file parts and non-file parts untouched", () => {
    const v4 = {
      type: "file",
      mediaType: "image/png",
      data: { type: "data", data: PNG_BASE64 },
    }
    const text = { type: "text", text: "hi" }
    const prompt = [
      { role: "system", content: "sys" },
      { role: "user", content: [text, v4] },
    ]
    const [system, user] = upgradePrompt(prompt) as {
      content: unknown
    }[]
    assert.equal(system, prompt[0])
    assert.deepEqual(user.content, [text, v4])
  })

  it("maps v3 tool-result media parts onto v4 file parts", () => {
    const [message] = upgradePrompt([
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "t1",
            toolName: "read",
            output: {
              type: "content",
              value: [
                { type: "text", text: "Image read successfully" },
                { type: "media", mediaType: "image/png", data: PNG_BASE64 },
                {
                  type: "image-url",
                  url: "https://example.com/c.png",
                },
              ],
            },
          },
        ],
      },
    ]) as { content: { output: { value: unknown[] } }[] }[]
    assert.deepEqual(message.content[0].output.value, [
      { type: "text", text: "Image read successfully" },
      {
        type: "file",
        mediaType: "image/png",
        data: { type: "data", data: PNG_BASE64 },
      },
      {
        type: "file",
        mediaType: "image/*",
        data: { type: "url", url: new URL("https://example.com/c.png") },
      },
    ])
  })
})

const anthropicResponse = () =>
  new Response(
    JSON.stringify({
      id: "msg_test",
      type: "message",
      role: "assistant",
      content: [{ type: "text", text: "ok" }],
      model: "claude-sonnet-4-6",
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 },
    }),
    { headers: { "content-type": "application/json" } },
  )

describe("withPromptCompat", () => {
  async function sentBody(wrap: boolean) {
    let body = ""
    const base = createAnthropic({
      apiKey: "test",
      fetch: async (_input, init) => {
        body = String(init?.body)
        return anthropicResponse()
      },
    })
    const provider = wrap ? withPromptCompat(base) : base
    await provider("claude-sonnet-4-6").doGenerate({
      prompt: [
        {
          role: "user",
          content: [
            { type: "text", text: "what is this?" },
            // The v3 shape OpenCode 2 sends.
            { type: "file", mediaType: "image/png", data: PNG_BASE64 },
          ],
        },
      ],
    } as never)
    return JSON.parse(body) as {
      messages: { content: { type: string; source?: unknown }[] }[]
    }
  }

  it("the unwrapped v4 provider drops a v3 image part", async () => {
    const body = await sentBody(false)
    const types = body.messages[0].content.map((block) => block.type)
    assert.deepEqual(types, ["text"])
  })

  it("sends the image once wrapped", async () => {
    const body = await sentBody(true)
    const image = body.messages[0].content.find(
      (block) => block.type === "image",
    )
    assert.deepEqual(image?.source, {
      type: "base64",
      media_type: "image/png",
      data: PNG_BASE64,
    })
  })

  it("wraps the languageModel factory too", async () => {
    let body = ""
    const provider = withPromptCompat(
      createAnthropic({
        apiKey: "test",
        fetch: async (_input, init) => {
          body = String(init?.body)
          return anthropicResponse()
        },
      }),
    )
    await provider.languageModel("claude-sonnet-4-6").doGenerate({
      prompt: [
        {
          role: "user",
          content: [{ type: "file", mediaType: "image/png", data: PNG_BASE64 }],
        },
      ],
    } as never)
    assert.match(body, /"type":"image"/)
  })

  it("upgrades streamed prompts, including tool-result images", async () => {
    let body = ""
    const provider = withPromptCompat(
      createAnthropic({
        apiKey: "test",
        fetch: async (_input, init) => {
          body = String(init?.body)
          return new Response("", {
            headers: { "content-type": "text/event-stream" },
          })
        },
      }),
    )
    await provider("claude-sonnet-4-6").doStream({
      prompt: [
        {
          role: "user",
          content: [{ type: "file", mediaType: "image/png", data: PNG_BASE64 }],
        },
        {
          role: "assistant",
          content: [
            {
              type: "tool-call",
              toolCallId: "t1",
              toolName: "read",
              input: {},
            },
          ],
        },
        {
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: "t1",
              toolName: "read",
              output: {
                type: "content",
                value: [
                  { type: "media", mediaType: "image/png", data: PNG_BASE64 },
                ],
              },
            },
          ],
        },
      ],
    } as never)
    const sent = JSON.parse(body) as {
      messages: {
        content: { type: string; content?: { type: string }[] }[]
      }[]
    }
    assert.equal(sent.messages[0].content[0].type, "image")
    const result = sent.messages[2].content.find(
      (block) => block.type === "tool_result",
    )
    assert.deepEqual(
      result?.content?.map((block) => block.type),
      ["image"],
    )
  })
})
