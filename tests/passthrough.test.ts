// packages/libs/node/kapitan/tests/passthrough.test.ts
import { expect, rstest, test } from "@rstest/core";
import { ProgramCommandImpl } from "../src/command.ts";
import { ArgvParser } from "../src/parser.ts";
import { ProgramImpl } from "../src/program.ts";

const leaf = () => new ProgramCommandImpl(new ArgvParser());

test("descend: tokens after -- become passthrough, pre-- token stays positional", () => {
	const root = leaf();
	const { positionalValues, rest, errors } = root.descend(["node", "--", "--inspect", "app.js"]);
	expect(errors).toEqual([]);
	expect(positionalValues).toEqual(["node"]);
	expect(rest).toEqual(["--inspect", "app.js"]);
});

test("descend: no -- yields an empty passthrough", () => {
	const root = leaf();
	const { rest } = root.descend(["a", "b"]);
	expect(rest).toEqual([]);
});

test("descend: post-- option-looking tokens are literal, not parsed", () => {
	const root = leaf();
	root.option("verbose", { type: "boolean" });
	const { optionTokens, rest, errors } = root.descend(["--", "--verbose"]);
	expect(errors).toEqual([]);
	expect(optionTokens).toEqual([]);
	expect(rest).toEqual(["--verbose"]);
});

test("descend: a second -- is a literal passthrough token", () => {
	const root = leaf();
	const { rest } = root.descend(["--", "a", "--", "b"]);
	expect(rest).toEqual(["a", "--", "b"]);
});

test("descend: on a group, -- collects payload with no unknown-command error", () => {
	const root = leaf();
	root.command("serve");
	const { commandPath, rest, errors } = root.descend(["--", "foo"]);
	expect(errors).toEqual([]);
	expect(commandPath).toEqual([]);
	expect(rest).toEqual(["foo"]);
});

test("descend: clustering is not applied after --", () => {
	const root = leaf();
	root.option("a", { type: "boolean" });
	root.option("b", { type: "boolean" });
	const { optionTokens, rest } = root.descend(["--", "-ab"]);
	expect(optionTokens).toEqual([]);
	expect(rest).toEqual(["-ab"]);
});

function driveStart(prog: ProgramImpl, argvTail: string[]) {
	const spy = rstest.spyOn(process, "argv", "get").mockReturnValue(["node", "cli", ...argvTail]);
	prog.start();
	spy.mockRestore();
}

type ActionArg = {
	command?: string;
	options: Record<string, unknown>;
	args: Record<string, unknown>;
	rest: string[];
};

test("action receives raw passthrough; named positional draws only from pre--", () => {
	const prog = new ProgramImpl();
	let received: { command?: string; args: Record<string, unknown>; rest: string[] } | undefined;
	prog
		.command("exec")
		.argument("cmd")
		.action((a: ActionArg) => {
			received = a as typeof received;
		});
	driveStart(prog, ["exec", "node", "--", "--inspect", "app.js"]);
	expect(received?.command).toBe("exec");
	expect(received?.args.cmd).toBe("node");
	expect(received?.rest).toEqual(["--inspect", "app.js"]);
});

test("action rest is [] when no -- is given", () => {
	const prog = new ProgramImpl();
	let received: { rest: string[] } | undefined;
	prog
		.command("exec")
		.argument("cmd")
		.action((a: ActionArg) => {
			received = a as typeof received;
		});
	driveStart(prog, ["exec", "node"]);
	expect(received?.rest).toEqual([]);
});

test("post-- option-looking tokens reach the action verbatim, unparsed", () => {
	const prog = new ProgramImpl();
	let received: { rest: string[] } | undefined;
	prog
		.command("run")
		.option("verbose", { type: "boolean" })
		.action((a: ActionArg) => {
			received = a as typeof received;
		});
	driveStart(prog, ["run", "--", "--verbose", "-x"]);
	expect(received?.rest).toEqual(["--verbose", "-x"]);
});
