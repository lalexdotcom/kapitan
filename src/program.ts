// Root program implementation for kapitan.

import { basename } from "node:path";
import { ProgramCommandImpl } from "./command.ts";
import { reportErrors } from "./errors.ts";
import { generateHelp } from "./help.ts";
import { ArgvParser, BUILTIN_HELP, BUILTIN_VERSION } from "./parser.ts";
import type { CommandHook, Program, ProgramConfig } from "./types.ts";

/**
 * Root program implementation with lifecycle methods.
 * Extends ProgramCommandImpl and adds `start()` / `startAsync()` dispatch.
 * Not exported — consumers use the `program` singleton.
 *
 * @typeParam TOptions - The resolved options shape for the root command.
 */
export class ProgramImpl<
	TOptions extends { [K: string]: unknown } = Record<never, never>,
> extends ProgramCommandImpl<TOptions> {
	#version?: string;

	constructor() {
		super(new ArgvParser());
	}

	/**
	 * Sets the global program configuration (e.g. date format).
	 *
	 * @param config - The configuration object to apply.
	 * @returns This program instance cast as `Program<TOptions>`.
	 */
	config(config: ProgramConfig) {
		this.parser.setConfig(config);
		return this as unknown as Program<TOptions>;
	}

	/**
	 * Sets the version string displayed by `--version` / `-V`.
	 * If never called, those flags are not intercepted and, being unregistered, are reported as an `Unknown option` error like any other unknown flag.
	 *
	 * @param v - The version string to display.
	 * @returns This program instance.
	 */
	version(v: string) {
		if (this.bodyEntered)
			throw new Error("version() must be called before any option/inject/hook/command/sub/action.");
		if (this.#version !== undefined) throw new Error("version already set.");
		this.#version = v;
		this.parser.enableVersionBuiltin();
		return this;
	}

	/**
	 * Shared resolution: handles --help/--version, descends to the matched command,
	 * binds options, and reports+aborts on error. Returns the command and options to
	 * run, or null when a terminal action (help/version/error) already handled it.
	 */
	#buildHelp(command: ProgramCommandImpl<Record<string, unknown>>, commandPath: string[]) {
		const help = command.getHelp();
		const name = [basename(process.argv[1] ?? "program"), ...commandPath].join(" ");
		return generateHelp(name, {
			// program description is always the root's; the node description is block 2 (only when not root)
			programDescription: commandPath.length ? this.getHelp().description : help.description,
			description: commandPath.length ? help.description : undefined,
			arguments: help.arguments,
			params: help.params,
			subcommands: help.subcommands,
			builtins: help.builtins,
			dateFormat: help.dateFormat,
			dateTimeFormat: help.dateTimeFormat,
		});
	}

	#resolve(): {
		command: ProgramCommandImpl<TOptions>;
		commandPath: string[];
		options: TOptions;
		args: Record<string, unknown>;
		rest: string[];
		hooks: CommandHook<Record<string, unknown>>[];
	} | null {
		const cliArgs = process.argv.slice(2);
		const { command, commandPath, nodePath, optionTokens, positionalValues, rest, errors } =
			this.descend(cliArgs);

		const hasBuiltin = (canonical: string) =>
			optionTokens.some((t) => t.kind === "option" && t.name === canonical);
		if (hasBuiltin(BUILTIN_HELP)) {
			process.stdout.write(this.#buildHelp(command, commandPath));
			process.exit(0);
		}
		if (this.#version !== undefined && hasBuiltin(BUILTIN_VERSION)) {
			process.stdout.write(`${this.#version}\n`);
			process.exit(0);
		}

		const isGroup = Object.keys(command.getChildren()).length > 0;
		if (isGroup) {
			if (errors.length === 0) {
				const name = [basename(process.argv[1] ?? "program"), ...commandPath].join(" ");
				errors.push({
					code: "missing-command",
					message: this.#buildHelp(command, commandPath),
					token: name,
				});
			}
			reportErrors(errors, this.parser.config?.errorHandler);
			return null;
		}

		const options = command.bindOptions(optionTokens, errors);
		const args = command.bindArguments(positionalValues, errors);
		if (errors.length) {
			reportErrors(errors, this.parser.config?.errorHandler);
			return null;
		}
		// §8 hook inheritance: every node's OWN hooks along root→leaf, outermost-first, then the leaf's own.
		const hooks = nodePath.flatMap((node) => node.getHooks());
		return {
			command: command as ProgramCommandImpl<TOptions>,
			commandPath,
			options: options as TOptions,
			args,
			rest,
			hooks,
		};
	}

	/** Sync entry point. Throws if the action/hooks are async (use startAsync instead). */
	start() {
		const resolved = this.#resolve();
		if (!resolved) return;
		const result = resolved.command.exec(
			resolved.commandPath,
			resolved.options,
			resolved.args,
			resolved.hooks,
			resolved.rest,
		);
		if (result != null && typeof (result as { then?: unknown }).then === "function") {
			throw new Error("Async action detected — use startAsync() instead of start().");
		}
		return result;
	}

	/** Async entry point. Awaits hooks and the action. */
	async startAsync(): Promise<void> {
		const resolved = this.#resolve();
		if (!resolved) return;
		await resolved.command.execAsync(
			resolved.commandPath,
			resolved.options,
			resolved.args,
			resolved.hooks,
			resolved.rest,
		);
	}
}

/** The root program singleton. Chain `.option()`, `.command()`, and `.action()` to define your CLI. */
export const program = new ProgramImpl() as unknown as Program;
