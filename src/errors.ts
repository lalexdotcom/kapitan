// Unified error model for kapitan: structured errors + reporting.

import type { OptionOptions } from "./types.ts";

export type CliErrorCode =
	| "unknown-option"
	| "duplicate-option"
	| "missing-value"
	| "missing-required"
	| "invalid-value"
	| "invalid-enum"
	| "unknown-command"
	| "missing-command"
	| "missing-argument"
	| "too-many-arguments";

/**
 * A single user-facing parsing error, accumulated over one parse pass.
 *
 * `token` is the identifier AS INVOKED: for an option, the raw used form
 * (`-a`, `--foo`, alias included); for a positional, the argument name; for a
 * missing option, its `--name`. For COMMAND-scoped errors it is the full
 * group/command chain (space-joined): the resolved leaf for `too-many-arguments`,
 * the attempted path for `unknown-command`.
 * `value` is the offending input; its shape follows `code`/`type` — a string for
 * a bad number/enum/date/command word, a `string[]` for `too-many-arguments`.
 * `type` and `format` describe what was expected, so a handler can format its
 * own message.
 */
export type CliError = {
	code: CliErrorCode;
	message: string;
	token: string;
	value?: unknown;
	type?: OptionOptions["type"];
	format?: string;
};

/** Sink for user-facing errors. Receives the whole batch and owns what happens next. */
export type ErrorHandler = (errors: CliError[]) => void;

/** Default sink: write every message to stderr, then exit(1) once. */
const defaultErrorHandler: ErrorHandler = (errors) => {
	for (const error of errors) process.stderr.write(`${error.message}\n`);
	process.exit(1);
};

/**
 * Reports the accumulated errors by delegating to the handler, or the default
 * sink when none is set. A custom handler receives the full CliError[] and OWNS
 * what happens next (including whether to terminate) — the dispatcher already
 * enforces abort by not running the action, so no exit is forced here. The
 * default sink writes each message to stderr and exits(1) ONCE.
 */
export function reportErrors(errors: CliError[], handler?: ErrorHandler) {
	(handler ?? defaultErrorHandler)(errors);
}
