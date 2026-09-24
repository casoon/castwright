# Conventions

Rules for changes to this project. Where the repository has no code yet, these are
owner-set rules the implementation is expected to follow, not observations.

## Repository layout

```
packages/   # published libraries and the CLI
examples/   # runnable example inputs, used by tests and by the project page
docs/       # the public documentation, rendered by the site
meta/       # this documentation — maintainer-facing, not rendered
site/       # the project page (GitHub Pages)
scripts/    # repository-level checks that cannot run inside the workspace
```

Directory names inside `packages/` are short (`core`, `player`, `astro`). The
published name lives in `package.json` and carries the `@casoon/castwright…` prefix.

## Dependency direction

```
core ◀─── astro ───▶ player
```

`core` depends on nothing in the workspace. `player` depends on `core` for **types
only** — a cast is self-describing, so there is no runtime edge, and adding one is a
design error rather than a convenience. Nothing depends on `player` except `astro` and
the docs site. Any renderer consumes a `Cast`, never a source file, and never imports
the parser.

## File naming

- Source files: `kebab-case.ts`.
- Astro components: `PascalCase.astro`.
- Demo inputs: `*.terminal.yaml`. VHS-compatible inputs keep `*.tape`.
- Build output: `*.cast`, `*.svg` in `dist/`.

## TypeScript

- `strict: true`, no implicit `any`, no non-null assertions in `core`.
- Public types are exported from a single `index.ts` per package; deep imports into
  `src/` are not part of any package's public API.
- Types describing the IR live in `core` only and are never re-declared elsewhere.

## Errors and CLI output

- Parse and validation errors carry the **source file, line, and column** and quote the
  offending line. A DSL that cannot point at the mistake is not finished.
- `castwright validate` exits non-zero on error and prints nothing on success.
- Errors go to stderr, results to stdout, so the CLI stays pipeable.

## DSL evolution

- DSL keywords are English and lowercase.
- Every new DSL key is documented in `docs/reference/dsl.md` **before** it is
  implemented, and gets an example in `examples/`.
- The DSL is versioned via the top-level `version:` field. Removing or repurposing a key
  is a breaking change and requires a major release.

## Testing

- `core` is tested with unit tests; the compiler additionally has **snapshot tests over
  generated `.cast` files** — this is what guards the determinism rule, so a snapshot is
  never updated without reading the diff.
- `examples/` doubles as the test corpus: every example must compile in CI.
- The player and the docs site are covered by Playwright, including an axe-core pass.

## Formatting and linting

Biome, single tool for both. Configuration lives at the repository root and applies to
all packages; per-package overrides need a reason. Two are in place, and both are about
Biome disagreeing with something else rather than about taste:

- `useLiteralKeys` is **off**. TypeScript's `noPropertyAccessFromIndexSignature` requires
  bracket notation for index signatures (`process.env['CI']`); Biome's rule forbids it.
  They contradict each other directly, and the TypeScript one is the one that carries
  type-safety meaning.
- `noUnusedVariables` and `noUnusedImports` are off for `**/*.astro`. Biome sees only an
  Astro file's frontmatter, not the template that uses those bindings, so every one of
  its reports there is a false positive.

## Releasing

Versioning is automated, publishing is not. Pushing to `main` with pending changesets
opens a "Version Packages" pull request; merging it bumps the versions and writes the
changelogs. **`npm publish` is then run by hand, from a maintainer's machine** — the
release workflow holds no npm token and never runs `changeset publish`.

```bash
git switch main && git pull
pnpm install && pnpm build
pnpm test && pnpm test:pack && pnpm test:compat
pnpm release          # changeset publish
```

The trade-off this accepts: npm provenance attestations can only be produced by a CI
publish, so packages released this way do not carry one.

## Commits

Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`), scoped by
package where useful (`feat(core): …`). No `Co-Authored-By` trailers.
