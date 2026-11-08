# Security Policy

## Supported versions

Security fixes go into the latest release of `@casoon/castwright`,
`@casoon/castwright-player` and `@casoon/astro-castwright` (the three are versioned
together).

## Reporting a vulnerability

Please do not open a public issue. Report it privately through
[GitHub's private vulnerability reporting](https://github.com/casoon/castwright/security/advisories/new)
for this repository. Include the affected version, a minimal `.terminal.yaml` (or `.tape`)
that reproduces it, and what you expected to happen.

You will get a first answer within a few days. Fixes are released as a patch version and
credited in the changelog unless you prefer otherwise.

## What is in scope

castwright runs on your machine at build time, so these are the areas that matter:

- **`exec:` steps** run real commands through `/bin/sh` and node-pty. Nothing runs unless
  you pass `--allow-exec` (CLI) or `allowExec: true` (Vite plugin). A demo file from a
  source you do not trust must not be built with that flag. A way to make commands run
  *without* the flag is a vulnerability.
- **The Vite plugin and the CLI read files** named by a demo (`show:` paths, `cwd:`,
  `.tape` sources) at build time. Reading outside what the file's author could already
  read, or leaking contents into the output beyond what the step shows, is in scope.
- **The player** renders terminal output into the page. Script injection through demo
  content or a `.cast` file is in scope.
- **Published packages**: releases are built in GitHub Actions and published to npm with
  provenance; a mismatch between a package and this repository is in scope.

Output recorded with `--record` is written into the demo file as-is; the build warns about
secrets it recognises, but reviewing a recording before publishing it is the author's job.
