// packages/libs/node/kapitan/src/tokenizer.ts
// Single-pass, arity-aware argv tokenizer — the one source of truth consumed by
// both command routing and option binding.

import type { CliError, CliErrorCode } from "./errors.ts";

export type Token =
	| { kind: "option"; name: string; value: string | undefined; raw: string }
	| { kind: "positional"; value: string }
	| { kind: "error"; error: CliError };

/** Sentinel canonical names for the built-in help and version options. */
export const BUILTIN_HELP = "\0help";
export const BUILTIN_VERSION = "\0version";

/** What the tokenizer needs to know about the option registry. */
export type TokenizerRegistry = {
	/** Canonical name for a raw long name / long alias / short key, or undefined if unknown. */
	resolve(rawName: string): string | undefined;
	/** 0 for boolean (no value), 1 otherwise. */
	arity(canonical: string): 0 | 1;
};

// A spaced value may start with '-' only if it looks like a negative number.
const NEGATIVE_NUMBER = /^-(\d|\.\d)/;

const err = (code: CliErrorCode, message: string, token: string): Token => ({
	kind: "error",
	error: { code, message, token },
});

/** Classifies the element at index `i`, consuming a spaced value when appropriate. */
export function classifyElement(
	args: string[],
	i: number,
	registry: TokenizerRegistry,
): { tokens: Token[]; next: number } {
	const a = args[i];

	if (a.startsWith("--")) {
		const body = a.slice(2);
		const eq = body.indexOf("=");
		const rawName = eq === -1 ? body : body.slice(0, eq);
		const attached = eq === -1 ? undefined : body.slice(eq + 1);

		if (rawName.startsWith("no-")) {
			const base = rawName.slice(3);
			const canonical = registry.resolve(base);
			if (
				canonical !== undefined &&
				canonical !== BUILTIN_HELP &&
				canonical !== BUILTIN_VERSION &&
				registry.arity(canonical) === 0
			) {
				return {
					tokens: [{ kind: "option", name: canonical, value: "false", raw: a }],
					next: i + 1,
				};
			}
		}

		const canonical = registry.resolve(rawName);
		if (canonical === undefined) {
			return { tokens: [err("unknown-option", `Unknown option '--${rawName}'`, a)], next: i + 1 };
		}
		if (attached !== undefined) {
			return {
				tokens: [{ kind: "option", name: canonical, value: attached, raw: a }],
				next: i + 1,
			};
		}
		if (registry.arity(canonical) === 0) {
			return {
				tokens: [{ kind: "option", name: canonical, value: undefined, raw: a }],
				next: i + 1,
			};
		}
		const next = args[i + 1];
		if (next !== undefined && (!next.startsWith("-") || NEGATIVE_NUMBER.test(next))) {
			return { tokens: [{ kind: "option", name: canonical, value: next, raw: a }], next: i + 2 };
		}
		return { tokens: [err("missing-value", `Missing value for '--${rawName}'`, a)], next: i + 1 };
	}

	if (a.startsWith("-") && a.length >= 2 && !NEGATIVE_NUMBER.test(a)) {
		const eq = a.indexOf("=");
		const shortKey = eq === -1 ? a : a.slice(0, eq);
		const attached = eq === -1 ? undefined : a.slice(eq + 1);

		// 1) Whole-token match first (preserves -v, registered multi-char -ab, -n=5).
		const whole = registry.resolve(shortKey);
		if (whole !== undefined) {
			if (attached !== undefined)
				return { tokens: [{ kind: "option", name: whole, value: attached, raw: a }], next: i + 1 };
			if (registry.arity(whole) === 0)
				return { tokens: [{ kind: "option", name: whole, value: undefined, raw: a }], next: i + 1 };
			const nextArg = args[i + 1];
			if (nextArg !== undefined && (!nextArg.startsWith("-") || NEGATIVE_NUMBER.test(nextArg))) {
				return { tokens: [{ kind: "option", name: whole, value: nextArg, raw: a }], next: i + 2 };
			}
			return { tokens: [err("missing-value", `Missing value for '${shortKey}'`, a)], next: i + 1 };
		}

		// 2) Cluster fallback: expand single chars left-to-right from index 1.
		const tokens: Token[] = [];
		for (let k = 1; k < a.length; k++) {
			const shortName = `-${a[k]}`;
			const canonical = registry.resolve(shortName);
			if (canonical === undefined) {
				tokens.push(err("unknown-option", `Unknown option '${shortName}'`, a));
				return { tokens, next: i + 1 };
			}
			if (registry.arity(canonical) === 0) {
				// `raw` carries the whole cluster token (e.g. `-abc`), not the isolated `-x`.
				// Downstream coerce/duplicate-option messages display what the user actually
				// typed — this is intentional. Do not "fix" raw to a per-char slice.
				tokens.push({ kind: "option", name: canonical, value: undefined, raw: a });
				continue;
			}
			// arity 1: the rest of the token is the value (one leading '=' stripped).
			let value = a.slice(k + 1);
			if (value.startsWith("=")) value = value.slice(1);
			if (value !== "") {
				tokens.push({ kind: "option", name: canonical, value, raw: a });
				return { tokens, next: i + 1 };
			}
			const nextArg = args[i + 1];
			if (nextArg !== undefined && (!nextArg.startsWith("-") || NEGATIVE_NUMBER.test(nextArg))) {
				tokens.push({ kind: "option", name: canonical, value: nextArg, raw: a });
				return { tokens, next: i + 2 };
			}
			tokens.push(err("missing-value", `Missing value for '${shortName}'`, a));
			return { tokens, next: i + 1 };
		}
		// All-flags happy path (e.g. `-abc` where every char is arity-0).
		// The loop body always executes at least once because the branch guard requires a.length >= 2.
		return { tokens, next: i + 1 };
	}

	return { tokens: [{ kind: "positional", value: a }], next: i + 1 };
}

/** Runs classifyElement across the whole slice. */
export function tokenize(args: string[], registry: TokenizerRegistry): Token[] {
	const out: Token[] = [];
	let i = 0;
	while (i < args.length) {
		const { tokens, next } = classifyElement(args, i, registry);
		out.push(...tokens);
		i = next;
	}
	return out;
}
