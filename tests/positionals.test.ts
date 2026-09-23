// packages/libs/node/kapitan/tests/positionals.test.ts
import { afterEach, expect, rstest, test } from "@rstest/core";
import { ProgramCommandImpl } from "../src/command.ts";
import { ArgvParser } from "../src/parser.ts";
import { ProgramImpl } from "../src/program.ts";

const leaf = () => new ProgramCommandImpl(new ArgvParser());
const makeRoot = () => new ProgramCommandImpl(new ArgvParser());

afterEach(() => {
	rstest.restoreAllMocks();
});

// Helper: drive #resolve via start() using ProgramImpl, capturing the raw message strings
// delivered to the custom errorHandler. Returns string[] — no fake code injected.
function resolveMessages(prog: ProgramImpl, argvTail: string[]) {
	const collected: string[] = [];
	prog.config({
		errorHandler: (errs) => collected.push(...errs.map((e) => e.message)),
	});
	const spy = rstest.spyOn(process, "argv", "get").mockReturnValue(["node", "cli", ...argvTail]);
	prog.start();
	spy.mockRestore();
	return collected;
}

// Helper: set argv then call start() on a ProgramImpl.
function driveStart(prog: ProgramImpl, argvTail: string[]) {
	const spy = rstest.spyOn(process, "argv", "get").mockReturnValue(["node", "cli", ...argvTail]);
	prog.start();
	spy.mockRestore();
}

// ─── argument() declaration guards (Phase 3 Task 2) ───────────────────────────

test("argument() on a node with children throws", () => {
	const g = leaf();
	g.command("child");
	expect(() => (g as unknown as { argument: (n: string) => unknown }).argument("x")).toThrow(
		/positional/i,
	);
});

test("a required argument after an optional one throws", () => {
	const c = leaf();
	c.argument("a"); // optional
	expect(() => c.argument("b", { required: true })).toThrow(/required .*after .*optional/i);
});

test("an argument after a variadic throws", () => {
	const c = leaf();
	c.argument("files", { array: true });
	expect(() => c.argument("more")).toThrow(/variadic .*last/i);
});

// ─── descend: leaf captures positionals ───────────────────────────────────────

test("descend: bare token on a leaf is captured as a positional, not an error", () => {
	const root = makeRoot();
	// root has no children → it is a leaf
	const result = root.descend(["hello"]);
	expect(result.errors).toEqual([]);
	expect(result.positionalValues).toEqual(["hello"]);
});

test("descend: multiple bare tokens on a leaf are all captured", () => {
	const root = makeRoot();
	const { positionalValues, errors } = root.descend(["foo", "bar", "baz"]);
	expect(errors).toEqual([]);
	expect(positionalValues).toEqual(["foo", "bar", "baz"]);
});

test("descend: bare token on a group (no child match) is still unknown-command", () => {
	const root = makeRoot();
	root.command("deploy");
	const { errors, positionalValues } = root.descend(["nope"]);
	expect(errors[0]).toMatchObject({ code: "unknown-command" });
	expect(positionalValues).toEqual([]);
});

test("descend: mixed options + positionals on a leaf", () => {
	const root = makeRoot();
	root.option("out", {});
	const { optionTokens, positionalValues, errors } = root.descend(["--out", "dist", "myfile.txt"]);
	expect(errors).toEqual([]);
	expect(positionalValues).toEqual(["myfile.txt"]);
	expect(optionTokens).toHaveLength(1);
});

test("descend: routing to a leaf child still captures positionals on that child", () => {
	const root = makeRoot();
	const deploy = root.command("deploy");
	deploy.argument("env", { required: true });
	const { command, commandPath, positionalValues, errors } = root.descend(["deploy", "prod"]);
	expect(errors).toEqual([]);
	expect(commandPath).toEqual(["deploy"]);
	expect(command).not.toBe(root);
	expect(positionalValues).toEqual(["prod"]);
});

// ─── bindArguments ────────────────────────────────────────────────────────────

test("bindArguments: maps a single required positional", () => {
	const c = leaf();
	c.argument("env", { required: true });
	const errors: import("../src/errors.ts").CliError[] = [];
	const args = c.bindArguments(["prod"], errors);
	expect(errors).toEqual([]);
	expect(args).toEqual({ env: "prod" });
});

test("bindArguments: maps an optional positional (present)", () => {
	const c = leaf();
	c.argument("env");
	const errors: import("../src/errors.ts").CliError[] = [];
	const args = c.bindArguments(["staging"], errors);
	expect(errors).toEqual([]);
	expect(args).toEqual({ env: "staging" });
});

test("bindArguments: maps an optional positional (absent) — key omitted", () => {
	const c = leaf();
	c.argument("env");
	const errors: import("../src/errors.ts").CliError[] = [];
	const args = c.bindArguments([], errors);
	expect(errors).toEqual([]);
	expect(args).not.toHaveProperty("env");
});

test("bindArguments: missing required positional pushes missing-argument error", () => {
	const c = leaf();
	c.argument("env", { required: true });
	const errors: import("../src/errors.ts").CliError[] = [];
	c.bindArguments([], errors);
	expect(errors[0]).toMatchObject({ code: "missing-argument" });
});

test("bindArguments: extra positionals with no variadic push too-many-arguments error", () => {
	const c = leaf();
	c.argument("env", { required: true });
	const errors: import("../src/errors.ts").CliError[] = [];
	c.bindArguments(["prod", "extra", "more"], errors);
	const tooMany = errors.filter((e) => e.code === "too-many-arguments");
	expect(tooMany).toHaveLength(1); // one error for the whole surplus, not one per arg
	expect(tooMany[0].value).toEqual(["extra", "more"]);
	expect(tooMany[0].token).toBe(""); // root/detached node → empty command chain
	expect(tooMany[0].message).toBe("Unexpected arguments ([extra,more])");
});

test("bindArguments: variadic argument collects remaining values as array", () => {
	const c = leaf();
	c.argument("files", { array: true });
	const errors: import("../src/errors.ts").CliError[] = [];
	const args = c.bindArguments(["a.ts", "b.ts", "c.ts"], errors);
	expect(errors).toEqual([]);
	expect(args).toEqual({ files: ["a.ts", "b.ts", "c.ts"] });
});

test("bindArguments: variadic after a required gets the remainder", () => {
	const c = leaf();
	c.argument("dest", { required: true });
	c.argument("files", { array: true });
	const errors: import("../src/errors.ts").CliError[] = [];
	const args = c.bindArguments(["out/", "a.ts", "b.ts"], errors);
	expect(errors).toEqual([]);
	expect(args).toEqual({ dest: "out/", files: ["a.ts", "b.ts"] });
});

test("bindArguments: coercion error is accumulated, MISSING is not stored", () => {
	const c = leaf();
	c.argument("count", { required: true, type: "number" });
	const errors: import("../src/errors.ts").CliError[] = [];
	const args = c.bindArguments(["notanumber"], errors);
	expect(errors[0]).toMatchObject({ code: "invalid-value" });
	expect(args).not.toHaveProperty("count");
});

// ─── bug fixes: variadic empty + optional default (Phase 3 Task 3) ───────────

test("bindArguments: required variadic with no values pushes missing-argument error", () => {
	const c = leaf();
	c.argument("files", { array: true, required: true });
	const errors: import("../src/errors.ts").CliError[] = [];
	c.bindArguments([], errors);
	expect(errors[0]).toMatchObject({ code: "missing-argument" });
});

test("bindArguments: optional variadic with no values sets key to []", () => {
	const c = leaf();
	c.argument("files", { array: true });
	const errors: import("../src/errors.ts").CliError[] = [];
	const args = c.bindArguments([], errors);
	expect(errors).toEqual([]);
	expect(args).toHaveProperty("files");
	expect(args.files).toEqual([]);
});

test("bindArguments: optional scalar with default and absent value sets key to default", () => {
	const c = leaf();
	c.argument("env", { default: "dev" });
	const errors: import("../src/errors.ts").CliError[] = [];
	const args = c.bindArguments([], errors);
	expect(errors).toEqual([]);
	expect(args).toEqual({ env: "dev" });
});

// ─── exec / execAsync pass args ───────────────────────────────────────────────

test("exec passes args to the action callback", () => {
	const c = leaf();
	c.argument("env", { required: true });
	let received: unknown;
	c.action((a) => {
		received = a;
	});
	c.exec([""], {}, { env: "prod" });
	expect(received).toMatchObject({ args: { env: "prod" } });
});

test("execAsync passes args to the action callback", async () => {
	const c = leaf();
	let received: unknown;
	c.action(async (a) => {
		received = a;
	});
	await c.execAsync([""], {}, {});
	expect(received).toMatchObject({ args: {} });
});

// ─── end-to-end via start() ───────────────────────────────────────────────────

test("a bare group invocation yields missing-command help message", () => {
	const root = new ProgramImpl();
	const serve = root.sub("serve");
	serve.command("frontend").action(() => {});
	serve.command("backend").action(() => {});
	const messages = resolveMessages(root, ["serve"]);
	expect(messages.some((m) => m.includes("frontend") && m.includes("backend"))).toBe(true);
});

// C1 regression: a group invoked with an unrecognised child must report ONLY unknown-command,
// NOT also missing-command (the group-help fallback must NOT fire when an error already exists).
test("group with unknown child reports only unknown-command, not missing-command", () => {
	const root = new ProgramImpl();
	const serve = root.sub("serve");
	serve.command("frontend").action(() => {});
	serve.command("backend").action(() => {});
	const messages = resolveMessages(root, ["serve", "nope"]);
	// Exactly one error surfaced
	expect(messages).toHaveLength(1);
	// The error mentions the unknown token, not the group-help subcommand listing
	expect(messages[0]).toMatch(/nope|[Uu]nknown/);
	// The group-help listing (missing-command) must NOT have fired
	expect(messages.some((m) => m.includes("frontend") && m.includes("backend"))).toBe(false);
});

test("end-to-end: start() runs a leaf action with coerced args", () => {
	const root = new ProgramImpl();
	let received: unknown;
	const rep = root.command("rep");
	rep.argument("count", { required: true, type: "number" });
	rep.action((a) => {
		received = a.args;
	});
	driveStart(root, ["rep", "3"]);
	expect(received).toEqual({ count: 3 });
});

test("a positional coercion error names the positional without a -- prefix", () => {
	const c = leaf();
	c.argument("count", { type: "number" });
	const errors: import("../src/errors.ts").CliError[] = [];
	c.bindArguments(["abc"], errors);
	expect(errors[0].message).toContain("'count'");
	expect(errors[0].message).not.toContain("'--count'");
});
