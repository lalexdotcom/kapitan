// ProgramCommandImpl — command definition and option dispatch for kapitan.

import { coerce, MISSING } from "./coerce.ts";
import type { CliError } from "./errors.ts";
import type { ArgvParser } from "./parser.ts";
import { classifyElement, type Token } from "./tokenizer.ts";
import type { ArgumentOptions, CommandHook, OptionOptions } from "./types.ts";
import { camelize } from "./utils.ts";

const DEFAULT_OPTION_OPTIONS: OptionOptions = {};

/**
 * Concrete implementation of the {@link Command}, {@link Group}, and {@link Program} interfaces.
 * Holds the option parser, registered sub-commands, hooks, and action callback.
 *
 * @typeParam TOptions - The resolved options shape for this command.
 */
export class ProgramCommandImpl<TOptions extends Record<string, unknown>> {
	parser: ArgvParser<TOptions>;
	protected bodyEntered = false;
	#action?: (args: {
		command?: string;
		options: TOptions;
		args: Record<string, unknown>;
		rest: string[];
	}) => unknown;
	#commands: { [k: string]: ProgramCommandImpl<Record<string, unknown>> } = {};
	#hooks: CommandHook<Record<string, unknown>>[];
	#description?: string;
	/** Ordered keys from the root to this node (excludes the root); empty on the root. Rendered with a leading "program". */
	#path: string[] = [];
	#arguments: { name: string; options: ArgumentOptions }[] = [];

	constructor(parser: ArgvParser<TOptions>, hooks: CommandHook<Record<string, unknown>>[] = []) {
		this.parser = parser;
		this.#hooks = hooks;
	}

	/**
	 * Registers a CLI option on this command's parser.
	 *
	 * @param name - The kebab-case CLI flag name.
	 * @param options - Optional option configuration.
	 * @returns This command instance (typed overloads widen the options type).
	 */
	// biome-ignore lint/suspicious/noExplicitAny: overload implementation escape hatch
	option(name: string, options?: OptionOptions): any {
		this.bodyEntered = true;
		this.parser.setParam(name, options ?? DEFAULT_OPTION_OPTIONS);
		return this;
	}

	/**
	 * Declares a positional argument on this command.
	 *
	 * @param name - The argument name (used as the key in resolved options).
	 * @param options - Optional argument configuration (required, array, default, etc.).
	 * @returns This command instance.
	 */
	// biome-ignore lint/suspicious/noExplicitAny: overload implementation escape hatch
	argument(name: string, options: ArgumentOptions = {}): any {
		if (Object.keys(this.#commands).length > 0) {
			throw new Error("Positional arguments are only allowed on leaf commands, not groups.");
		}
		const prev = this.#arguments[this.#arguments.length - 1];
		if (prev?.options.array) {
			throw new Error("A variadic positional must be the last argument.");
		}
		if (options.required && prev && !prev.options.required) {
			// an optional positional (with or without a default) is still optional;
			// a required one may not follow it (positionally ambiguous).
			throw new Error("A required positional may not come after an optional one.");
		}
		this.bodyEntered = true;
		this.#arguments.push({ name, options });
		return this;
	}

	/**
	 * Registers a named sub-command.
	 *
	 * @param name - The sub-command token.
	 * @param options - Optional `description` shown in the parent's Commands help section.
	 * @returns The newly created sub-command instance.
	 */
	command(name: string, options?: { description?: string }) {
		this.bodyEntered = true;
		if (this.#action !== undefined)
			throw new Error("A command with an action cannot have sub-commands (it is a leaf).");
		if (Object.hasOwn(this.#commands, name))
			throw new Error(`"${name}" is already declared in ${["program", ...this.#path].join(" ")}.`);
		const child = new ProgramCommandImpl(this.parser.fork(), []);
		child.#path = [...this.#path, name];
		this.#commands[name] = child;
		if (options?.description) {
			child.#description = options.description;
		}
		return child as unknown as ProgramCommandImpl<TOptions>;
	}

	/**
	 * Registers a named sub-group (a child node intended to hold further sub-commands).
	 *
	 * @param name - The sub-group token.
	 * @returns The newly created child instance.
	 */
	sub(name: string) {
		this.bodyEntered = true;
		return this.command(name);
	}

	/**
	 * Registers a hook to run with resolved options before the action.
	 *
	 * @param func - The hook function.
	 * @returns This command instance.
	 */
	hook(func: CommandHook<TOptions>) {
		this.bodyEntered = true;
		this.#hooks.push(func as CommandHook<Record<string, unknown>>);
		return this;
	}

	/**
	 * Injects a static or computed value as a named option, bypassing CLI parsing.
	 *
	 * @param name - The kebab-case option name.
	 * @param value - A static value or zero-argument factory function.
	 * @returns This command instance.
	 */
	inject(name: string, value: unknown) {
		this.bodyEntered = true;
		this.parser.setParam(name, { injected: value });
		return this;
	}

	/**
	 * Sets the action callback for this command.
	 *
	 * @param act - Function receiving the resolved options when this command is dispatched.
	 * @returns This command instance.
	 */
	action(
		act: (args: {
			command?: string;
			options: TOptions;
			args: Record<string, unknown>;
			rest: string[];
		}) => unknown,
	) {
		this.bodyEntered = true;
		if (Object.keys(this.#commands).length > 0)
			throw new Error("A command with sub-commands cannot have an action (it is a group).");
		if (this.#action !== undefined) throw new Error("This command already has an action.");
		this.#action = act;
		return this;
	}

	/**
	 * Sets a human-readable description for this command.
	 *
	 * @param desc - Description shown in the Commands section of parent help.
	 * @returns This command instance.
	 */
	description(desc: string) {
		if (this.bodyEntered)
			throw new Error(
				"description() must be called before any option/inject/hook/command/sub/action.",
			);
		if (this.#description !== undefined) throw new Error("description already set.");
		this.#description = desc;
		return this;
	}

	/** Help data for this command (options + subcommand descriptions). */
	getHelp(): {
		description?: string;
		arguments: { name: string; options: ArgumentOptions }[];
		params: Record<string, OptionOptions>;
		subcommands: Record<string, string>;
		builtins: {
			help: { short: boolean; long: boolean };
			version: { short: boolean; long: boolean };
		};
		dateFormat: string;
		dateTimeFormat: string;
	} {
		const rawParams = this.parser.params;
		const params: Record<string, OptionOptions> = {};
		for (const [k, v] of Object.entries(rawParams)) {
			if (!("injected" in v)) params[k] = v as OptionOptions;
		}
		const subcommands: Record<string, string> = {};
		for (const [n, cmd] of Object.entries(this.#commands)) {
			subcommands[n] = cmd.#description ?? "";
		}
		return {
			description: this.#description,
			arguments: this.#arguments,
			params,
			subcommands,
			builtins: this.parser.builtinListing(),
			dateFormat: this.parser.config?.dateFormat ?? "yyyy-MM-dd",
			dateTimeFormat: this.parser.config?.dateTimeFormat ?? "yyyy-MM-dd HH:mm:ss",
		};
	}

	/** Returns the registered child commands. Internal use only — not on any public interface. */
	getChildren() {
		return this.#commands;
	}

	/** Returns this command's OWN hooks (excludes inherited). Internal use only — not on any public interface. */
	getHooks() {
		return this.#hooks;
	}
	exec(
		commandPath: string[],
		options: TOptions,
		args: Record<string, unknown> = {},
		hooks: CommandHook<Record<string, unknown>>[] = this.#hooks,
		rest: string[] = [],
	) {
		for (const hook of hooks) {
			// Sync path: an async hook cannot be awaited here — surface it like an async action.
			const result: unknown = hook(options as Record<string, unknown>);
			if (result != null && typeof (result as { then?: unknown }).then === "function")
				throw new Error("Async hook detected — use startAsync() instead of start().");
		}
		return this.#action?.({ command: commandPath.join(" ") || undefined, options, args, rest });
	}

	/** Async variant: awaits each hook and the action. */
	async execAsync(
		commandPath: string[],
		options: TOptions,
		args: Record<string, unknown> = {},
		hooks: CommandHook<Record<string, unknown>>[] = this.#hooks,
		rest: string[] = [],
	): Promise<void> {
		for (const hook of hooks) await hook(options as Record<string, unknown>);
		await this.#action?.({ command: commandPath.join(" ") || undefined, options, args, rest });
	}

	/**
	 * Recursively resolves a command path to the matching sub-command instance.
	 *
	 * @param path - The remaining command tokens to traverse.
	 * @returns The matching command instance, or `undefined` if not found.
	 */
	getCommand([command, ...commands]: string[]):
		| ProgramCommandImpl<Record<string, unknown>>
		| undefined {
		if (command === undefined)
			return this as unknown as ProgramCommandImpl<Record<string, unknown>>;
		const firstCommand = this.#commands[command];
		return firstCommand?.getCommand(commands);
	}

	/** Descends the command tree using the tokenizer, collecting option tokens and errors. */
	descend(args: string[]): {
		command: ProgramCommandImpl<Record<string, unknown>>;
		commandPath: string[];
		nodePath: ProgramCommandImpl<Record<string, unknown>>[];
		optionTokens: Token[];
		positionalValues: string[];
		rest: string[];
		errors: CliError[];
	} {
		// biome-ignore lint/suspicious/noExplicitAny: recursive tree walk over sibling instances
		let current: ProgramCommandImpl<any> = this;
		const commandPath: string[] = [];
		// nodePath tracks every node from root to the resolved leaf, for hook inheritance (§8).
		const nodePath: ProgramCommandImpl<Record<string, unknown>>[] = [current];
		const optionTokens: Token[] = [];
		const positionalValues: string[] = [];
		// Everything after the first bare `--` is a raw operand — no option/command parsing (§ end-of-options).
		const rest: string[] = [];
		const errors: CliError[] = [];
		let i = 0;
		while (i < args.length) {
			if (args[i] === "--") {
				rest.push(...args.slice(i + 1));
				break;
			}
			const { tokens, next } = classifyElement(args, i, current.parser.registry());
			i = next;
			for (const token of tokens) {
				if (token.kind === "option") {
					optionTokens.push(token);
				} else if (token.kind === "error") {
					errors.push(token.error);
				} else {
					const sub = current.#commands[token.value];
					if (sub) {
						current = sub;
						commandPath.push(token.value);
						nodePath.push(sub);
					} else if (Object.keys(current.#commands).length === 0) {
						// leaf node — capture as positional
						positionalValues.push(token.value);
					} else {
						// group node with no matching child
						errors.push({
							code: "unknown-command",
							message: `Unknown command "${token.value}"`,
							token: [...commandPath, token.value].join(" "),
							value: token.value,
						});
					}
				}
			}
		}
		return {
			command: current,
			commandPath,
			nodePath,
			optionTokens,
			positionalValues,
			rest,
			errors,
		};
	}

	/** Binds option tokens on this command's parser. */
	bindOptions(optionTokens: Token[], errors: CliError[]) {
		return this.parser.bind(
			optionTokens as Extract<Token, { kind: "option" }>[],
			errors,
		) as TOptions;
	}

	/** Maps captured positional strings to declared arguments, coercing each value. */
	bindArguments(values: string[], errors: CliError[], commandName = this.#path.join(" ")) {
		const out: Record<string, unknown> = {};
		let vi = 0;
		for (let ai = 0; ai < this.#arguments.length; ai++) {
			const { name, options } = this.#arguments[ai];
			const key = camelize(name);
			if (options.array) {
				// variadic — slurp all remaining values; coerce each individually (not comma-split)
				const slice = values.slice(vi);
				vi = values.length;
				if (options.required && slice.length === 0) {
					errors.push({
						code: "missing-argument",
						message: `Missing required argument <${name}...>`,
						token: name,
					});
					continue;
				}
				const scalarOptions = { ...options, array: false } as typeof options;
				const coerced: unknown[] = [];
				for (const raw of slice) {
					const r = coerce(raw, scalarOptions, this.parser.config, name, errors);
					if (r !== MISSING) coerced.push(r);
				}
				out[key] = coerced; // ALWAYS set — empty [] is valid for optional variadic
				continue;
			}
			const raw = values[vi];
			if (raw === undefined) {
				if (options.required) {
					errors.push({
						code: "missing-argument",
						message: `Missing required argument '${name}'`,
						token: name,
					});
				} else if (options.default !== undefined) {
					out[key] = options.default;
				}
				// optional, absent, no default — omit key (matches T | undefined type)
			} else {
				vi++;
				const r = coerce(raw, options, this.parser.config, name, errors);
				if (r !== MISSING) out[key] = r;
			}
		}
		// remaining values with no declared slot
		if (vi < values.length) {
			const extra = values.slice(vi);
			errors.push({
				code: "too-many-arguments",
				message: commandName
					? `Unexpected arguments for "${commandName}" ([${extra.join(",")}])`
					: `Unexpected arguments ([${extra.join(",")}])`,
				token: commandName,
				value: extra,
			});
		}
		return out;
	}
}
