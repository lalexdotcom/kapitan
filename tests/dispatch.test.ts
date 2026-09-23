// packages/libs/node/kapitan/tests/dispatch.test.ts
import { afterEach, expect, rstest, test } from "@rstest/core";
import { ProgramCommandImpl } from "../src/command.ts";
import { ArgvParser } from "../src/parser.ts";
import { ProgramImpl } from "../src/program.ts";

afterEach(() => {
	rstest.restoreAllMocks();
});

const makeRoot = () => new ProgramCommandImpl(new ArgvParser());

test("descend: --out dist deploy routes to the deploy subcommand", () => {
	const root = makeRoot();
	root.option("out", {});
	root.command("deploy");
	const { command, commandPath, optionTokens, errors } = root.descend(["--out", "dist", "deploy"]);
	expect(errors).toEqual([]);
	expect(commandPath).toEqual(["deploy"]);
	expect(optionTokens.map((t) => (t.kind === "option" ? t.value : null))).toEqual(["dist"]);
	// the matched command is the deploy child, not root
	expect(command).not.toBe(root);
});

test("descend: unknown positional on a leaf is captured (not an error)", () => {
	const root = makeRoot();
	// root has no children → it is a leaf; bare tokens become positionals
	const { errors, positionalValues } = root.descend(["nope"]);
	expect(errors).toEqual([]);
	expect(positionalValues).toEqual(["nope"]);
});

test("exec passes the joined command path as args.command", () => {
	const root = makeRoot();
	let received: unknown;
	root.command("serve");
	// grab the child to attach an action
	const { command } = root.descend(["serve"]);
	command.action((args: unknown) => {
		received = args;
	});
	command.exec(["serve"], {});
	expect(received).toMatchObject({ command: "serve" });
});

test("start() does not run the action when a required option is missing (custom handler)", () => {
	const seen: string[] = [];
	const prog = new ProgramImpl();
	prog.config({ errorHandler: (errs) => seen.push(...errs.map((e) => e.message)) });
	let ran = false;
	prog.option("name", { required: true });
	prog.action(() => {
		ran = true;
	});
	const argvSpy = rstest.spyOn(process, "argv", "get").mockReturnValue(["node", "cli"]);
	prog.start();
	expect(ran).toBe(false);
	expect(seen).toContain("Missing required parameter '--name'");
	argvSpy.mockRestore();
});

test("sub() registers a routable child group", () => {
	const calls: string[] = [];
	const root = makeRoot();
	root
		.sub("serve")
		.command("frontend")
		.action(() => calls.push("frontend"));
	const { command, commandPath, optionTokens, errors } = root.descend(["serve", "frontend"]);
	expect(errors).toEqual([]);
	const options = command.bindOptions(optionTokens, []);
	command.exec(commandPath, options);
	expect(calls).toEqual(["frontend"]);
});

test("end-to-end: a short-flag cluster resolves through the real registry and binds", () => {
	const root = makeRoot();
	(root.option as (n: string, o: object) => void)("verbose", {
		type: "boolean",
		alias: [{ name: "v", short: true }],
	});
	(root.option as (n: string, o: object) => void)("output", {
		alias: [{ name: "o", short: true }],
	});
	// -vo dist : cluster → -v (flag) then -o consumes the next arg 'dist'
	const { optionTokens, errors } = root.descend(["-vo", "dist"]);
	const options = root.bindOptions(optionTokens, [...errors]);
	expect(options).toEqual({ verbose: true, output: "dist" });
});
