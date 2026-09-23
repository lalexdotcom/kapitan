// packages/libs/node/kapitan/tests/help-output.test.ts
import { afterEach, expect, rstest, test } from "@rstest/core";
import { ProgramCommandImpl } from "../src/command.ts";
import { generateHelp } from "../src/help.ts";
import { ArgvParser } from "../src/parser.ts";
import { ProgramImpl } from "../src/program.ts";

const node = () => new ProgramCommandImpl(new ArgvParser());

test("getHelp exposes description, arguments, and per-flag builtins", () => {
	const c = node();
	c.description("do the thing");
	c.argument("source", { required: true, description: "src" });
	c.option("env", { type: ["dev", "prod"], alias: [{ name: "e", short: true }] });
	const h = c.getHelp();
	expect(h.description).toBe("do the thing");
	expect(h.arguments).toEqual([
		{ name: "source", options: { required: true, description: "src" } },
	]);
	expect(h.builtins).toEqual({
		help: { short: true, long: true },
		version: { short: false, long: false },
	});
	expect(h.params.env).toBeDefined();
});

test("getHelp params excludes injected params", () => {
	const c = node();
	c.option("real", { type: "boolean" });
	c.inject("token", "secret");
	const h = c.getHelp();
	expect(h.params.real).toBeDefined();
	expect(h.params.token).toBeUndefined();
});

const B_BOTH = { help: { short: true, long: true }, version: { short: true, long: true } };
const B_HELP = { help: { short: true, long: true }, version: { short: false, long: false } };
const EMPTY = { arguments: [], params: {}, subcommands: {}, builtins: B_HELP };

afterEach(() => {
	rstest.restoreAllMocks();
});

test("leaf render: descriptions, usage with positionals, Arguments, options with aliases + suffixes", () => {
	const out = generateHelp("cli deploy", {
		programDescription: "prog tagline",
		description: "deploy stuff",
		arguments: [
			{ name: "source", options: { required: true, description: "src dir" } },
			{ name: "tags", options: { array: true, description: "tags" } },
		],
		params: {
			env: {
				type: ["dev", "prod"],
				required: true,
				description: "Target",
				alias: [{ name: "e", short: true }],
			},
			"dry-run": {
				type: "boolean",
				description: "Dry",
				alias: [
					{ name: "d", short: true },
					{ name: "dr", short: true },
				],
			},
		},
		subcommands: {},
		builtins: B_BOTH,
	});
	expect(out).toContain("prog tagline");
	expect(out).toContain("deploy stuff");
	expect(out).toContain("Usage: cli deploy [options] <source> [tags...]");
	expect(out).toContain("Arguments:");
	expect(out).toContain("<source>");
	expect(out).toContain("(required)");
	expect(out).toContain("--env <env>, -e");
	expect(out).toContain("(choices: dev|prod, required)");
	expect(out).toContain("--dry-run, -d, -dr");
	expect(out).toContain("--help, -h");
	expect(out).toContain("--version, -V");
});

test("group render: usage <command>, Commands, no Arguments", () => {
	const out = generateHelp("cli remote", {
		...EMPTY,
		subcommands: { add: "Add one", list: "List all" },
	});
	expect(out).toContain("Usage: cli remote [options] <command>");
	expect(out).toContain("Commands:");
	expect(out).toContain("add");
	expect(out).not.toContain("Arguments:");
});

test("boolean has no placeholder; non-boolean shows <name> + default", () => {
	const out = generateHelp("cli", {
		...EMPTY,
		params: {
			verbose: { type: "boolean", description: "V" },
			workers: { default: 4, description: "W" },
		},
	});
	expect(out).toContain("--verbose");
	expect(out).not.toContain("--verbose <");
	expect(out).toContain("--workers <workers>");
	expect(out).toContain("(default: 4)");
});

test("built-in per-flag: only -h overridden → --help alone (no -h)", () => {
	const out = generateHelp("cli", {
		...EMPTY,
		builtins: { help: { short: false, long: true }, version: { short: false, long: false } },
	});
	expect(out).toContain("--help");
	expect(out).not.toContain("--help, -h");
});

test("both help forms overridden → no built-in help row", () => {
	const out = generateHelp("cli", {
		...EMPTY,
		builtins: { help: { short: false, long: false }, version: { short: false, long: false } },
	});
	expect(out).not.toContain("Display help");
});

// integration: getHelp → #buildHelp → generateHelp, driven through start()
function driveHelp(prog: ProgramImpl, argvTail: string[]) {
	const stdout: string[] = [];
	rstest.spyOn(process, "argv", "get").mockReturnValue(["node", "cli", ...argvTail]);
	rstest.spyOn(process.stdout, "write").mockImplementation((s: string | Uint8Array) => {
		stdout.push(String(s));
		return true;
	});
	rstest.spyOn(process, "exit").mockImplementation(((code?: number) => {
		throw { __exit: code ?? 0 };
	}) as never);
	try {
		prog.start();
	} catch (e) {
		if (!(e && typeof e === "object" && "__exit" in e)) throw e;
	}
	return stdout.join("");
}

test("integration: subcommand --help shows program + command descriptions and args", () => {
	const prog = new ProgramImpl();
	prog.description("root tagline");
	const remote = prog.sub("remote");
	const add = remote.command("add");
	add.description("register a remote");
	add.argument("name", { required: true, description: "remote name" });
	add.option("url", {
		required: true,
		alias: [{ name: "u", short: true }],
		description: "remote url",
	});
	add.action(() => {});
	const out = driveHelp(prog, ["remote", "add", "--help"]);
	expect(out).toContain("root tagline");
	expect(out).toContain("register a remote");
	expect(out).toContain("Usage: cli remote add [options] <name>");
	expect(out).toContain("--url <url>, -u");
});

test("Options section header is omitted when there are no option rows", () => {
	const out = generateHelp("cli", {
		arguments: [],
		params: {},
		subcommands: {},
		builtins: { help: { short: false, long: false }, version: { short: false, long: false } },
	});
	expect(out).not.toContain("Options:");
});

test("long alias renders as --name between canonical and short forms", () => {
	const out = generateHelp("cli", {
		arguments: [],
		params: { config: { alias: ["cfg", { name: "c", short: true }], description: "Config" } },
		subcommands: {},
		builtins: { help: { short: false, long: false }, version: { short: false, long: false } },
	});
	expect(out).toContain("--config <config>, --cfg, -c");
});

test("subcommand Usage includes the program name", () => {
	const prog = new ProgramImpl();
	const g = prog.sub("remote");
	g.command("add")
		.argument("name", { required: true })
		.action(() => {});
	const out = driveHelp(prog, ["remote", "add", "--help"]);
	expect(out).toContain("Usage: cli remote add [options] <name>");
});

test("options are listed alphabetically", () => {
	const out = generateHelp("cli", {
		arguments: [],
		subcommands: {},
		builtins: { help: { short: false, long: false }, version: { short: false, long: false } },
		params: {
			zebra: { type: "boolean", description: "Z" },
			alpha: { type: "boolean", description: "A" },
			mango: { type: "boolean", description: "M" },
		},
	});
	const iA = out.indexOf("--alpha");
	const iM = out.indexOf("--mango");
	const iZ = out.indexOf("--zebra");
	expect(iA).toBeGreaterThan(-1);
	expect(iA).toBeLessThan(iM);
	expect(iM).toBeLessThan(iZ);
});

test("required variadic positional renders with angle brackets", () => {
	const out = generateHelp("cli", {
		arguments: [{ name: "files", options: { array: true, required: true, description: "F" } }],
		params: {},
		subcommands: {},
		builtins: { help: { short: false, long: false }, version: { short: false, long: false } },
	});
	expect(out).toContain("<files...>");
	expect(out).not.toContain("[files...]");
	expect(out).toContain("(required, multiple)");
});

test("optional variadic positional keeps square brackets", () => {
	const out = generateHelp("cli", {
		arguments: [{ name: "files", options: { array: true, description: "F" } }],
		params: {},
		subcommands: {},
		builtins: { help: { short: false, long: false }, version: { short: false, long: false } },
	});
	expect(out).toContain("[files...]");
});

test("array option shows a multiple tag", () => {
	const out = generateHelp("cli", {
		arguments: [],
		params: { tag: { array: true, description: "Tag" } },
		subcommands: {},
		builtins: { help: { short: false, long: false }, version: { short: false, long: false } },
	});
	expect(out).toContain("--tag <tag>");
	expect(out).toContain("(multiple)");
});

test("number and date options show a type tag (date uses the configured format)", () => {
	const out = generateHelp("cli", {
		arguments: [],
		params: {
			workers: { type: "number", description: "W" },
			since: { type: "date", description: "D" },
		},
		subcommands: {},
		builtins: { help: { short: false, long: false }, version: { short: false, long: false } },
		dateFormat: "dd/MM/yyyy",
	});
	expect(out).toContain("(numeric)");
	expect(out).toContain("(date: dd/MM/yyyy)");
});
