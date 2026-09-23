// Type and interface definitions for kapitan.

import type { ErrorHandler } from "./errors.ts";

/** Configures how a single CLI option is parsed. */
export type OptionOptions = {
	required?: boolean;
	var?: string;
	type?: OptionsOptionType;
	array?: boolean;
	default?: unknown;
	description?: string;
	alias?: (string | { name: string; short?: boolean })[];
};

/** Represents an injected (non-CLI) value that is always provided. */
export type InjectedOption = {
	injected: unknown;
};

/**
 * A hook function invoked with resolved options before the command action runs.
 *
 * A union of two function types: the `Promise<void>` arm makes the async contract explicit
 * in the type (self-documenting), while the `void` arm keeps inline sync hooks ergonomic — a
 * value-returning expression body such as `() => arr.push(x)` is still accepted (TS's
 * exact-`void` callback rule applies per-arm, which a `void | Promise<void>` return would lose).
 * An async hook is awaited by `startAsync()`; the sync `start()` throws if a hook returns a
 * promise (mirroring the async-action guard).
 *
 * @param options - The fully resolved options object for the command.
 */
export type CommandHook<TOptionsType> =
	| ((options: TOptionsType) => void)
	| ((options: TOptionsType) => Promise<void>);

/** The set of supported built-in option type coercions. */
export type OptionsOptionType =
	| "boolean"
	| "string"
	| "number"
	| "date"
	| "datetime"
	| ((value: string) => unknown)
	| readonly unknown[];

type OptionType<O extends OptionOptions> = O["array"] extends true
	? OptionParseReturnType<O>[]
	: OptionParseReturnType<O>;

type OptionParseReturnType<O extends OptionOptions = OptionOptions> = O["type"] extends (
	v: string,
) => infer R
	? R
	: O["type"] extends "date"
		? Date
		: O["type"] extends "datetime"
			? Date
			: O["type"] extends "boolean"
				? boolean
				: O["type"] extends "number"
					? number
					: O["type"] extends readonly (infer E)[]
						? E
						: string;

type OptionKey<
	NAME extends string,
	OPTION extends OptionOptions = OptionOptions,
> = OPTION["required"] extends true
	? { [KEY in CamelizeSnakeString<NAME>]: OptionType<OPTION> }
	: "default" extends keyof OPTION
		? { [KEY in CamelizeSnakeString<NAME>]: OptionType<OPTION> }
		: { [KEY in CamelizeSnakeString<NAME>]?: OptionType<OPTION> };

/**
 * Converts a kebab-case string literal type to camelCase.
 *
 * @typeParam S - The kebab-case string type to transform.
 */
export type CamelizeSnakeString<S extends string> = S extends `${infer F}-${infer R}`
	? `${F}${Capitalize<CamelizeSnakeString<R>>}`
	: S;

type OptionNameCheck<NAME extends string, T> =
	CamelizeSnakeString<NAME> extends keyof T ? never : NAME;
type OptionVarCheck<VAR extends string, T> = CamelizeSnakeString<VAR> extends keyof T ? never : VAR;

type AliasFlags<A> = A extends readonly (infer E)[]
	? E extends string
		? `--${E}`
		: E extends { name: infer N extends string; short: true }
			? `-${N}`
			: E extends { name: infer N extends string }
				? `--${N}`
				: never
	: never;

type OptionFlags<NAME extends string, OPTION> =
	| `--${NAME}`
	| (OPTION extends { alias: infer A extends readonly unknown[] } ? AliasFlags<A> : never);

type OptionAddCheck<NAME extends string, OPTION, T, R extends string> =
	CamelizeSnakeString<NAME> extends keyof T
		? never
		: Extract<OptionFlags<NAME, OPTION>, R> extends never
			? NAME
			: never;

// The non-localized subset of fecha's tokens (moment.js style). Month/day *names*
// (MMM, MMMM, ddd, dddd) are intentionally excluded; AM/PM (a, A) is kept.

/** Tokens allowed in a `date` format string (numeric, locale-independent). */
export type DateToken = "YYYY" | "YY" | "MM" | "M" | "DD" | "D";
/** Tokens allowed in a `datetime` format string — the date tokens plus time. */
export type DateTimeToken =
	| DateToken
	| "HH"
	| "H"
	| "hh"
	| "h"
	| "mm"
	| "m"
	| "ss"
	| "s"
	| "SSS"
	| "SS"
	| "S"
	| "A"
	| "a"
	| "ZZ"
	| "Z";
/** Literal separators permitted between format tokens. */
type FormatSep = "-" | "/" | ":" | " " | ".";

/**
 * Compile-time validator: `true` iff `S` is built solely from `Tok` tokens and
 * {@link FormatSep} separators. Purely lexical — it rejects unknown/miscased
 * tokens (the date-fns habit `yyyy`/`dd` is caught) but does not check semantic
 * sensibility (e.g. a repeated field, or `MMM` seen as `MM`+`M`).
 */
type ValidateFormat<S extends string, Tok extends string> = S extends ""
	? true
	: S extends `${Tok}${infer Rest}`
		? ValidateFormat<Rest, Tok>
		: S extends `${FormatSep}${infer Rest}`
			? ValidateFormat<Rest, Tok>
			: false;

/** Error brand surfaced in place of an invalid format literal. */
type FormatError<S extends string> = `kapitan: "${S}" contains an unknown date/time token`;

/** Constrains a format literal to `Tok` tokens, else surfaces a readable error. */
type CheckedFormat<S extends string, Tok extends string> =
	ValidateFormat<S, Tok> extends true ? unknown : FormatError<S>;

/** Global configuration for the program instance. */
export type ProgramConfig = {
	/** fecha token format for 'date' options (default 'YYYY-MM-DD'). See {@link DateToken}. */
	dateFormat?: string;
	/** fecha token format for 'datetime' options (default 'YYYY-MM-DD HH:mm:ss'). See {@link DateTimeToken}. */
	dateTimeFormat?: string;
	/** Custom error handler invoked for user-facing errors (missing required option, invalid enum value, unknown command). When omitted, defaults to writing to process.stderr and calling process.exit(1). */
	errorHandler?: ErrorHandler;
};

export type ArgumentOptions = {
	required?: boolean;
	type?: OptionsOptionType;
	array?: boolean;
	default?: unknown;
	description?: string;
};

type ArgumentKey<
	NAME extends string,
	ARG extends ArgumentOptions = ArgumentOptions,
> = ARG["array"] extends true
	? { [K in CamelizeSnakeString<NAME>]: OptionType<ARG> }
	: ARG["required"] extends true
		? { [K in CamelizeSnakeString<NAME>]: OptionType<ARG> }
		: "default" extends keyof ARG
			? { [K in CamelizeSnakeString<NAME>]: OptionType<ARG> }
			: { [K in CamelizeSnakeString<NAME>]?: OptionType<ARG> };

type BodyKind = "command" | "group" | "program";

type Body<
	K extends BodyKind,
	T extends Record<string, unknown>,
	R extends string,
	A extends Record<string, unknown>,
> = K extends "command"
	? CommandBody<T, R, A>
	: K extends "group"
		? GroupBody<T, R>
		: K extends "program"
			? ProgramBody<T, R, A>
			: never;

interface WithOptions<
	T extends Record<string, unknown>,
	R extends string,
	A extends Record<string, unknown>,
	K extends BodyKind,
> {
	// var overload: name guard is flag-only (not OptionAddCheck) because the stored key is VAR, not NAME;
	// raw-name collisions are covered by R (which now includes every option's and inject's --NAME).
	option<NAME extends string, VAR extends string, const OPTION extends OptionOptions>(
		name: Extract<OptionFlags<NAME, OPTION>, R> extends never ? NAME : never,
		options: OPTION & { var: OptionVarCheck<VAR, T> },
	): Body<K, T & OptionKey<VAR, OPTION>, R | OptionFlags<NAME, OPTION>, A>;
	option<NAME extends string, const OPTION extends OptionOptions>(
		name: OptionAddCheck<NAME, OPTION, T, R>,
		options: OPTION,
	): Body<K, T & OptionKey<NAME, OPTION>, R | OptionFlags<NAME, OPTION>, A>;
	option<NAME extends string>(
		name: OptionNameCheck<NAME, T>,
	): Body<K, T & OptionKey<NAME>, R | `--${NAME}`, A>;
	inject<NAME extends string, VALUE_FUNCTION extends () => unknown>(
		name: OptionNameCheck<NAME, T>,
		value: VALUE_FUNCTION,
	): Body<
		K,
		T & { [P in CamelizeSnakeString<NAME>]: ReturnType<VALUE_FUNCTION> },
		R | `--${NAME}`,
		A
	>;
	inject<NAME extends string, VALUE>(
		name: OptionNameCheck<NAME, T>,
		value: VALUE,
	): Body<K, T & { [P in CamelizeSnakeString<NAME>]: VALUE }, R | `--${NAME}`, A>;
}

interface WithArguments<
	T extends Record<string, unknown>,
	R extends string,
	A extends Record<string, unknown>,
	K extends BodyKind,
> {
	argument<NAME extends string, const ARG extends ArgumentOptions>(
		name: NAME,
		options: ARG,
	): Body<K, T, R, A & ArgumentKey<NAME, ARG>>;
	argument<NAME extends string>(
		name: NAME,
	): Body<K, T, R, A & { [P in CamelizeSnakeString<NAME>]?: string }>;
}

interface WithHook<
	T extends Record<string, unknown>,
	R extends string,
	A extends Record<string, unknown>,
	K extends BodyKind,
> {
	hook(func: CommandHook<T>): Body<K, T, R, A>;
}

interface WithChildren<T extends Record<string, unknown>, R extends string> {
	sub(name: string): Group<T, R>;
	command(name: string): Command<T, R>;
}

interface WithAction<T extends Record<string, unknown>, A extends Record<string, unknown>> {
	action(
		act: (args: {
			command?: string;
			options: { [K in keyof T]: T[K] };
			args: { [K in keyof A]: A[K] };
			rest: string[];
		}) => unknown,
	): void;
}

// biome-ignore lint/complexity/noBannedTypes: {} is the intersection identity for the option/args accumulators (T & OptionKey<…> growth). Record<string, unknown> would widen the empty case; Record<string, never>'s index signature would force intersected keys to `never`. This is the single documented use of the empty-object type.
type EmptyRecord = {};

interface CommandBody<
	TOptionsType extends Record<string, unknown> = EmptyRecord,
	R extends string = never,
	A extends Record<string, unknown> = EmptyRecord,
> extends WithOptions<TOptionsType, R, A, "command">,
		WithArguments<TOptionsType, R, A, "command">,
		WithHook<TOptionsType, R, A, "command">,
		WithAction<TOptionsType, A> {}

export interface Command<
	TOptionsType extends Record<string, unknown> = EmptyRecord,
	R extends string = never,
	A extends Record<string, unknown> = EmptyRecord,
> extends CommandBody<TOptionsType, R, A> {
	description(desc: string): CommandBody<TOptionsType, R, A>;
}

/**
 * Body-phase interface of a group node: shared option registration, injection,
 * and hook wiring, plus {@link sub} to nest further groups and {@link command}
 * to attach leaf commands. No `description` (that lives on {@link Group}).
 *
 * @typeParam TOptionsType - The cumulative resolved options shape for this group.
 */
interface GroupBody<
	TOptionsType extends Record<string, unknown> = EmptyRecord,
	R extends string = never,
> extends WithOptions<TOptionsType, R, EmptyRecord, "group">,
		WithChildren<TOptionsType, R>,
		WithHook<TOptionsType, R, EmptyRecord, "group"> {}

export interface Group<
	TOptionsType extends Record<string, unknown> = EmptyRecord,
	R extends string = never,
> extends GroupBody<TOptionsType, R> {
	description(desc: string): GroupBody<TOptionsType, R>;
}

interface ProgramBody<
	TOptionsType extends Record<string, unknown> = EmptyRecord,
	R extends string = never,
	A extends Record<string, unknown> = EmptyRecord,
> extends WithOptions<TOptionsType, R, A, "program">,
		WithArguments<TOptionsType, R, A, "program">,
		WithChildren<TOptionsType, R>,
		WithHook<TOptionsType, R, A, "program">,
		WithAction<TOptionsType, A> {
	// The `'js'` sentinel (JS_FORMAT in date.ts) bypasses fecha and delegates to
	// the platform `new Date()` parser (ISO 8601 + engine extras).
	config<const F extends string = string, const G extends string = string>(config: {
		dateFormat?: (F & CheckedFormat<F, DateToken>) | "js";
		dateTimeFormat?: (G & CheckedFormat<G, DateTimeToken>) | "js";
		errorHandler?: ProgramConfig["errorHandler"];
	}): ProgramBody<TOptionsType, R, A>;
	start(): void;
	startAsync(): Promise<void>;
}

// After version() is consumed, only description() remains (plus the body).
interface ProgramHeaderD<
	TOptionsType extends Record<string, unknown> = EmptyRecord,
	R extends string = never,
	A extends Record<string, unknown> = EmptyRecord,
> extends ProgramBody<TOptionsType, R, A> {
	description(desc: string): ProgramBody<TOptionsType, R, A>;
}

// After description() is consumed, only version() remains (plus the body).
interface ProgramHeaderV<
	TOptionsType extends Record<string, unknown> = EmptyRecord,
	R extends string = never,
	A extends Record<string, unknown> = EmptyRecord,
> extends ProgramBody<TOptionsType, R, A> {
	version(v: string): ProgramBody<TOptionsType, R, A>;
}

export interface Program<
	TOptionsType extends Record<string, unknown> = EmptyRecord,
	R extends string = never,
	A extends Record<string, unknown> = EmptyRecord,
> extends ProgramBody<TOptionsType, R, A> {
	// version() and description() are order-free one-shots: each returns a phase that still
	// offers the OTHER, so both `.version().description()` and `.description().version()`
	// compile; each drops itself, and entering the body drops both.
	version(v: string): ProgramHeaderD<TOptionsType, R, A>;
	description(desc: string): ProgramHeaderV<TOptionsType, R, A>;
}
