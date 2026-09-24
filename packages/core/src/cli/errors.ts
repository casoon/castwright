// A user-facing CLI mistake (bad flag, missing argument) — distinct from
// CastwrightParseError (a mistake in the DSL file itself). Both are caught at
// the top level in index.ts and printed as a single clean message, with no
// stack trace, since neither indicates an internal bug.

export class CliUsageError extends Error {}
