// Help text generation for kapitan.

import type { ArgumentOptions, OptionOptions } from "./types.ts";

/**
 * Generates formatted help text for a command or program.
 *
 * @param name - The command/program name shown in the Usage header line.
 * @param help - Structured help model: descriptions, arguments, params, subcommands, builtins.
 * @returns Formatted help text, newline-terminated.
 */
export function generateHelp(
	name: string,
	help: {
		programDescription?: string;
		description?: string;
		arguments: { name: string; options: ArgumentOptions }[];
		params: Record<string, OptionOptions>;
		subcommands: Record<string, string>;
		builtins: {
			help: { short: boolean; long: boolean };
			version: { short: boolean; long: boolean };
		};
		dateFormat?: string;
		dateTimeFormat?: string;
	},
) {
	const hasSubcmds = Object.keys(help.subcommands).length > 0;
	const lines: string[] = [];

	// 1–2. descriptions (program then node)
	if (help.programDescription) lines.push(help.programDescription);
	if (help.description) lines.push(help.description);
	if (lines.length) lines.push("");

	// 3. Usage
	const dateFormat = help.dateFormat ?? "yyyy-MM-dd";
	const dateTimeFormat = help.dateTimeFormat ?? "yyyy-MM-dd HH:mm:ss";
	const argTok = (n: string, o: ArgumentOptions) =>
		o.array ? (o.required ? `<${n}...>` : `[${n}...]`) : o.required ? `<${n}>` : `[${n}]`;
	const usageTail = help.arguments.length
		? ` ${help.arguments.map((a) => argTok(a.name, a.options)).join(" ")}`
		: hasSubcmds
			? " <command>"
			: "";
	lines.push(`Usage: ${name} [options]${usageTail}`);
	lines.push("");

	// suffix shared by options and arguments
	const suffix = (o: {
		type?: OptionOptions["type"];
		default?: unknown;
		required?: boolean;
		array?: boolean;
	}) => {
		const parts: string[] = [];
		if (Array.isArray(o.type)) parts.push(`choices: ${(o.type as string[]).join("|")}`);
		else if (o.type === "number") parts.push("numeric");
		else if (o.type === "date") parts.push(`date: ${dateFormat}`);
		else if (o.type === "datetime") parts.push(`datetime: ${dateTimeFormat}`);
		if (o.default !== undefined) parts.push(`default: ${String(o.default)}`);
		if (o.required) parts.push("required");
		if (o.array) parts.push("multiple");
		return parts.length ? ` (${parts.join(", ")})` : "";
	};

	type Row =
		| { kind: "section"; title: string }
		| { kind: "blank" }
		| { kind: "entry"; left: string; right: string };
	const rows: Row[] = [];

	// 4. Arguments (leaf)
	if (help.arguments.length) {
		rows.push({ kind: "section", title: "Arguments:" });
		for (const a of help.arguments)
			rows.push({
				kind: "entry",
				left: argTok(a.name, a.options),
				right: (a.options.description ?? "") + suffix(a.options),
			});
		rows.push({ kind: "blank" });
	}

	// 5. Options (canonical-first flags, then built-in rows) — header only when non-empty
	const optionRows: Row[] = [];
	for (const [key, o] of Object.entries(help.params).sort(([a], [b]) => a.localeCompare(b))) {
		const placeholder = o.type === "boolean" ? "" : ` <${key}>`;
		const longs: string[] = [];
		const shorts: string[] = [];
		for (const a of o.alias ?? []) {
			if (typeof a === "string") longs.push(`--${a}`);
			else if (a.short) shorts.push(`-${a.name}`);
			else longs.push(`--${a.name}`);
		}
		const flags = [`--${key}${placeholder}`, ...longs, ...shorts].join(", ");
		optionRows.push({ kind: "entry", left: flags, right: (o.description ?? "") + suffix(o) });
	}
	const helpFlags = [help.builtins.help.long ? "--help" : "", help.builtins.help.short ? "-h" : ""]
		.filter(Boolean)
		.join(", ");
	if (helpFlags) optionRows.push({ kind: "entry", left: helpFlags, right: "Display help" });
	const versionFlags = [
		help.builtins.version.long ? "--version" : "",
		help.builtins.version.short ? "-V" : "",
	]
		.filter(Boolean)
		.join(", ");
	if (versionFlags)
		optionRows.push({ kind: "entry", left: versionFlags, right: "Display version" });
	if (optionRows.length) {
		rows.push({ kind: "section", title: "Options:" });
		rows.push(...optionRows);
	}

	// 6. Commands (group)
	if (hasSubcmds) {
		rows.push({ kind: "blank" });
		rows.push({ kind: "section", title: "Commands:" });
		for (const [n, d] of Object.entries(help.subcommands))
			rows.push({ kind: "entry", left: n, right: d });
	}

	// render two-column, aligned on the widest left cell
	const entries = rows.filter((r): r is Extract<Row, { kind: "entry" }> => r.kind === "entry");
	const w = entries.length ? Math.max(...entries.map((r) => r.left.length)) : 0;
	for (const r of rows) {
		if (r.kind === "section") lines.push(r.title);
		else if (r.kind === "blank") lines.push("");
		else lines.push(`  ${r.left.padEnd(w)}   ${r.right}`.trimEnd());
	}
	lines.push("");
	return lines.join("\n");
}
