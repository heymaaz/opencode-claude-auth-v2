# Releasing

## 1. Verify the release

```bash
pnpm run build
pnpm run lint
pnpm run test:isolated

# Run separately with real credentials; do not use the unit-test environment.
pnpm test:headless
```

`test:isolated` prevents unit tests from reading real Claude credentials. The same test command
runs automatically during `pnpm publish` through `prepublishOnly`.
The headless smoke test requires macOS, `opencode` V2 on PATH, and valid Claude Code credentials.
It verifies a live request using fresh credentials; credential refresh is covered by unit tests,
not by this smoke test.

## 2. Commit the changes

Use a conventional commit so the release history describes the change:

```bash
git add <changed-files>
git commit -m "fix: describe the change"
```

## 3. Bump the beta version

```bash
pnpm version prerelease --preid beta --no-git-tag-version
git add package.json
VERSION=$(node -p "require('./package.json').version")
git commit -m "chore: release $VERSION"
```

## 4. Push and publish

```bash
git push origin main
npm whoami
pnpm publish --access public --tag latest
npm dist-tag add "opencode-claude-auth-v2@$VERSION" beta
```

If `npm whoami` returns `401 Unauthorized`, authenticate before publishing:

```bash
npm logout
npm login --auth-type=web
npm whoami
```

The expected npm account is `heymaaz`.

## 5. Verify npm

```bash
npm view opencode-claude-auth-v2 version
npm view opencode-claude-auth-v2 dist-tags --json
```

Confirm that the published version and both the `latest` and `beta` tags match the version in `package.json`.
