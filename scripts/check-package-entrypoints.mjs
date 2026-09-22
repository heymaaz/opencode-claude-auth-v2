import assert from "node:assert/strict"

const entrypoints = ["../index.js", "../opencode-claude-auth.js"]

for (const entrypoint of entrypoints) {
  const plugin = (await import(entrypoint)).default

  assert.equal(
    plugin?.id,
    "griffinmartin.claude-auth",
    `${entrypoint} must default-export the OpenCode 2 plugin definition`,
  )
  assert.equal(
    typeof plugin.setup,
    "function",
    `${entrypoint} must expose a setup function`,
  )
}
