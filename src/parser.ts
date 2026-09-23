// Argv parser orchestrator for kapitan: registry + tokenize + bind.

import { coerce, MISSING } from "./coerce.ts";
import { type CliError, reportErrors } from "./errors.ts";
import {
	BUILTIN_HELP,
	BUILTIN_VERSION,
	type Token,
	type TokenizerRegistry,
	tokenize,
} from "./tokenizer.ts";

export { BUILTIN_HELP, BUILTIN_VERSION };

import type { InjectedOption, OptionOptions, ProgramConfig } from "./types.ts";
import { camelize } from "./utils.ts";

/**
 * Parses an argv-style string array into typed options and command tokens.
 *
 * @typeParam TOptions - The resolved options shape this parser produces.
 */
export class ArgvParser<TOptions extends Record<string, unknown> = Record<string, unknown>> {
	#config?: ProgramConfig;
	#params: { [k: string]: OptionOptions | InjectedOption };
	#aliasIndex: Map<string, string> = new Map();

	// Set true by ProgramImpl.version(); makes the registry resolve --version/-V to
	// the version built-in. `.version()` runs before any subcommand fork, so forks
	// (which copy this in fork()) inherit it.
	#builtinVersion = false;

	enableVersionBuiltin() {
		this.#builtinVersion = true;
	}

	constructor(
		conf?: ProgramConfig,
		init?: { params: { [k: string]: OptionOptions | InjectedOption } },
	) {
		this.setConfig({ ...conf });
		this.#params = { ...(init?.params ?? {}) };
	}

	/**
	 * Updates the parser configuration (e.g. dateFormat).
	 *
	 * @param conf - The new configuration to apply.
	 */
	setConfig(conf?: ProgramConfig) {
		this.#config = conf;
	}

	/** Returns the current parser configuration. */
	get config() {
		return this.#config;
	}

	/** Returns a shallow copy of the registered params map. */
	get params(): { [k: string]: OptionOptions | InjectedOption } {
		return { ...this.#params };
	}

	/**
	 * Creates a child parser inheriting the current config and registered params.
	 *
	 * @returns A new ArgvParser instance with a shallow copy of the params map.
	 */
	fork() {
		// Shallow copy: params map is cloned, but OptionOptions objects are shared
		const child = new ArgvParser(this.#config, { params: this.#params });
		child.#aliasIndex = new Map(this.#aliasIndex);
		child.#builtinVersion = this.#builtinVersion;
		return child;
	}

	/**
	 * Registers a CLI option or injected value by its CLI flag name.
	 *
	 * @param name - The kebab-case CLI flag name (e.g. `'output-dir'`).
	 * @param opt - The option configuration or injected value descriptor.
	 */
	setParam(name: string, opt: OptionOptions | InjectedOption) {
		// --- VALIDATE pass (no mutation) ---
		// Guard: canonical name must not already be registered (either as a canonical or as a long alias)
		if (name in this.#params) {
			throw new Error(`Option "${name}" is already registered by option "${name}"`);
		}
		const existingAliasOwner = this.#aliasIndex.get(name);
		if (existingAliasOwner !== undefined) {
			throw new Error(`Option "${name}" is already registered by option "${existingAliasOwner}"`);
		}
		if (!("injected" in opt) && opt.alias) {
			for (const entry of opt.alias) {
				const isShort = typeof entry !== "string" && entry.short === true;
				const aliasRawName = typeof entry === "string" ? entry : entry.name;
				// Long aliases stored without dash prefix (e.g. "out" for --out)
				// Short aliases stored with single-dash prefix (e.g. "-v" for -v)
				const mapKey = isShort ? `-${aliasRawName}` : aliasRawName;
				// Check alias-vs-alias collision
				if (this.#aliasIndex.has(mapKey)) {
					const dashPrefix = isShort ? "-" : "--";
					throw new Error(
						`Alias "${dashPrefix}${aliasRawName}" is already registered by option "${this.#aliasIndex.get(mapKey)}"`,
					);
				}
				// Check long-alias-vs-canonical-name collision (bare name namespace is shared)
				if (!isShort && mapKey in this.#params) {
					throw new Error(`Alias "--${aliasRawName}" is already registered by option "${mapKey}"`);
				}
			}
		}
		// --- COMMIT pass (only reached if validation fully passed) ---
		this.#params[name] = opt;
		if (!("injected" in opt) && opt.alias) {
			for (const entry of opt.alias) {
				const isShort = typeof entry !== "string" && entry.short === true;
				const aliasRawName = typeof entry === "string" ? entry : entry.name;
				const mapKey = isShort ? `-${aliasRawName}` : aliasRawName;
				this.#aliasIndex.set(mapKey, name);
			}
		}
	}

	/** Registry view consumed by the tokenizer. */
	registry(): TokenizerRegistry {
		const versionEnabled = this.#builtinVersion;
		return {
			resolve: (rawName) => {
				// Consumer lookup FIRST — a consumer flag always wins over a built-in.
				const canonical = this.#aliasIndex.get(rawName) ?? rawName;
				const opt = this.#params[canonical];
				if (opt && !("injected" in opt)) return canonical;
				// An injected reservation of this name shadows the built-in fallback (the name
				// is taken by the consumer, not CLI-settable) — restore the pre-fallback `undefined`.
				if (opt) return undefined;
				// Low-priority built-in fallback (per-flag: --help and -h are independent keys).
				// Help is always available (never disabled); version only when .version() was called.
				if (rawName === "help" || rawName === "-h") return BUILTIN_HELP;
				if (versionEnabled && (rawName === "version" || rawName === "-V")) return BUILTIN_VERSION;
				return undefined;
			},
			arity: (canonical) => {
				if (canonical === BUILTIN_HELP || canonical === BUILTIN_VERSION) return 0;
				const opt = this.#params[canonical];
				return opt && !("injected" in opt) && opt.type === "boolean" ? 0 : 1;
			},
		};
	}

	// Which built-in forms the help output should list. A form is listed unless the
	// consumer owns it; version forms are both off until .version() was called.
	builtinListing() {
		const owned = (raw: string) => {
			const canonical = this.#aliasIndex.get(raw) ?? raw;
			const opt = this.#params[canonical];
			return !!(opt && !("injected" in opt));
		};
		return {
			help: { short: !owned("-h"), long: !owned("help") },
			version: {
				short: this.#builtinVersion && !owned("-V"),
				long: this.#builtinVersion && !owned("version"),
			},
		};
	}

	/**
	 * Binds option tokens to a resolved options object, then applies injected
	 * values, defaults, and required checks. Errors are accumulated, not thrown.
	 */
	bind(
		optionTokens: Extract<Token, { kind: "option" }>[],
		errors: CliError[],
	): Record<string, unknown> {
		const options: Record<string, unknown> = {};
		const seen = new Set<string>(); // non-array options already bound (duplicate detection)
		for (const tok of optionTokens) {
			const option = this.#params[tok.name] as OptionOptions | undefined; // resolve() excludes injected
			if (!option) {
				// Built-in help/version sentinels are consumed by #resolve (which exits before bind() runs);
				// guard so a future refactor reaching bind() with one never yields a spurious unknown-option.
				if (tok.name === BUILTIN_HELP || tok.name === BUILTIN_VERSION) continue;
				errors.push({
					code: "unknown-option",
					message: `Unknown option '${tok.raw}'`,
					token: tok.raw,
				});
				continue;
			}
			const optionVar = camelize(option.var ?? tok.name);
			if (!option.array) {
				if (seen.has(optionVar)) {
					errors.push({
						code: "duplicate-option",
						message: `Option '${tok.raw}' given more than once`,
						token: tok.raw,
						value: tok.value,
					});
					continue;
				}
				seen.add(optionVar);
			}
			const result = coerce(tok.value, option, this.#config, tok.raw, errors);
			if (result === MISSING) continue;
			if (option.array) {
				const arr = (options[optionVar] as unknown[] | undefined) ?? [];
				arr.push(result);
				options[optionVar] = arr;
			} else {
				options[optionVar] = result;
			}
		}
		for (const [name, cfg] of Object.entries(this.#params)) {
			if ("injected" in cfg) {
				options[camelize(name)] =
					typeof cfg.injected === "function" ? cfg.injected() : cfg.injected;
				continue;
			}
			const optionVar = camelize(cfg.var ?? name);
			if (cfg.required && options[optionVar] === undefined) {
				errors.push({
					code: "missing-required",
					message: `Missing required parameter '--${name}'`,
					token: `--${name}`,
					type: cfg.type,
				});
			}
			if (cfg.default !== undefined && options[optionVar] === undefined) {
				options[optionVar] =
					typeof cfg.default === "function" ? (cfg.default as () => unknown)() : cfg.default;
			}
		}
		return options;
	}

	/**
	 * Parses an argv slice into positional `commands` and typed `options`.
	 * Accumulates errors and reports them through the configured handler.
	 */
	parse(args: string[]) {
		const errors: CliError[] = [];
		const commands: string[] = [];
		const optionTokens: Extract<Token, { kind: "option" }>[] = [];
		for (const tok of tokenize(args, this.registry())) {
			if (tok.kind === "error") errors.push(tok.error);
			else if (tok.kind === "positional") commands.push(tok.value);
			else optionTokens.push(tok);
		}
		const options = this.bind(optionTokens, errors);
		if (errors.length) reportErrors(errors, this.#config?.errorHandler);
		return { commands, options: options as TOptions, errors };
	}
}
