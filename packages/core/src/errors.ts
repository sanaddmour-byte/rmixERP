/**
 * Thrown by `jodStringToFils`/`decimalStringToMilliUnits` (and any other
 * raw-string-to-domain-value parser in this package) on malformed input
 * that reached business logic without having been validated first — e.g.
 * a Zod body schema that only constrains a money/quantity field to
 * `string`, not its decimal format (CLAUDE.md: validate at both
 * boundaries). A distinct class, not a plain `Error`, so the API's
 * top-level error-handling middleware (`apps/api/src/app.ts`) can map it
 * to a 400 in one place instead of every one of this package's dozens of
 * call sites across the API needing its own try/catch — the gap the
 * review's "malformed credit limit returns a 500" finding was one
 * instance of.
 */
export class InputParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InputParseError";
  }
}
