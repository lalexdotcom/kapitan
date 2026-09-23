// packages/libs/node/kapitan/tests/help-version.test.ts
import { afterEach, expect, rstest, test } from "@rstest/core";
import { ProgramImpl } from "../src/program.ts";

afterEach(() => {
	rstest.restoreAllMocks();
});

// Drive start() with a throw-based process.exit so execution halts at exit(0)
// exactly as in production (a no-op exit mock would let #resolve fall through).
function driveBuiltin(prog: ProgramImpl, argvTail: string[]) {
	const stdout: string[] = [];
	rstest.spyOn(process, "argv", "get").mockReturnValue(["node", "cli", ...argvTail]);
	rstest.spyOn(process.stdout, "write").mockImplementation((s: string | Uint8Array) => {
		stdout.push(String(s));
		return true;
	});
	let exitCode: number | undefined;
	rstest.spyOn(process, "exit").mockImplementation(((code?: number) => {
		throw { __exit: code ?? 0 };
	}) as never);
	try {
		prog.start();
	} catch (e) {
		if (e && typeof e === "object" && "__exit" in e) exitCode = (e as { __exit: number }).__exit;
		else throw e;
	}
	return { exitCode, stdout: stdout.join("") };
}

// Collect errorHandler messages (no exit) for the unknown-option cases.
function driveMessages(prog: ProgramImpl, argvTail: string[]) {
	const messages: string[] = [];
	prog.config({ errorHandler: (errs) => messages.push(...errs.map((e) => e.message)) });
	rstest.spyOn(process, "argv", "get").mockReturnValue(["node", "cli", ...argvTail]);
	prog.start();
	return messages;
}

test("--help prints help to stdout and exits 0", () => {
	const prog = new ProgramImpl();
	prog.command("build").action(() => {});
	const { exitCode, stdout } = driveBuiltin(prog, ["--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("build");
});

test("-h prints help and exits 0", () => {
	const prog = new ProgramImpl();
	prog.command("build").action(() => {});
	expect(driveBuiltin(prog, ["-h"]).exitCode).toBe(0);
});

test("subcommand --help renders that node help and wins over missing-command", () => {
	const prog = new ProgramImpl();
	prog
		.sub("serve")
		.command("frontend")
		.action(() => {});
	const { exitCode, stdout } = driveBuiltin(prog, ["serve", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("frontend");
});

test("--version / -V print the version and exit 0 when .version() was set", () => {
	const mk = () => {
		const prog = new ProgramImpl();
		prog
			.version("1.2.3")
			.command("go")
			.action(() => {});
		return prog;
	};
	expect(driveBuiltin(mk(), ["--version"])).toEqual({ exitCode: 0, stdout: "1.2.3\n" });
	expect(driveBuiltin(mk(), ["-V"])).toEqual({ exitCode: 0, stdout: "1.2.3\n" });
});

test("-V without .version() is an unknown-option", () => {
	const prog = new ProgramImpl();
	prog.command("go").action(() => {});
	expect(driveMessages(prog, ["go", "-V"]).join("\n")).toMatch(/[Uu]nknown option '-V'/);
});

test("collision (a): a consumer -h wins; --help still shows help", () => {
	let seen: unknown;
	const prog = new ProgramImpl();
	prog
		.option("host", { alias: [{ name: "h", short: true }] })
		.command("go")
		.action((ctx: { options: unknown }) => {
			seen = ctx.options;
		});
	const noExit = driveBuiltin(prog, ["go", "-h", "x"]); // -h is arity 1 → consumes 'x'
	expect(noExit.exitCode).toBeUndefined();
	expect((seen as { host?: string }).host).toBe("x");

	const prog2 = new ProgramImpl();
	prog2
		.option("host", { alias: [{ name: "h", short: true }] })
		.command("go")
		.action(() => {});
	expect(driveBuiltin(prog2, ["go", "--help"]).exitCode).toBe(0);
});

test("owning both --help and -h effectively disables the help built-in", () => {
	let seen: unknown;
	const prog = new ProgramImpl();
	prog
		.option("help", { type: "boolean", alias: [{ name: "h", short: true }] })
		.command("go")
		.action((ctx: { options: unknown }) => {
			seen = ctx.options;
		});
	const { exitCode } = driveBuiltin(prog, ["go", "--help"]);
	expect(exitCode).toBeUndefined();
	expect((seen as { help?: boolean }).help).toBe(true);
});

test("(c): --msg=--help passes --help as the value, help NOT triggered", () => {
	let seen: unknown;
	const prog = new ProgramImpl();
	prog
		.option("msg")
		.command("go")
		.action((ctx: { options: unknown }) => {
			seen = ctx.options;
		});
	const { exitCode } = driveBuiltin(prog, ["go", "--msg=--help"]);
	expect(exitCode).toBeUndefined();
	expect((seen as { msg?: string }).msg).toBe("--help");
});

test("-vh cluster: -v flag plus built-in help", () => {
	const prog = new ProgramImpl();
	prog.option("verbose", { type: "boolean", alias: [{ name: "v", short: true }] }).action(() => {});
	expect(driveBuiltin(prog, ["-vh"]).exitCode).toBe(0);
});

test("post-`--` --help is inert (detection stops at the boundary)", () => {
	let seen: string[] | undefined;
	const prog = new ProgramImpl();
	prog.command("go").action((ctx) => {
		seen = ctx.rest;
	});
	const { exitCode } = driveBuiltin(prog, ["go", "--", "--help"]);
	expect(exitCode).toBeUndefined();
	expect(seen).toEqual(["--help"]);
});

test("--no-help is an unknown-option (built-ins are not negatable)", () => {
	const prog = new ProgramImpl();
	prog.command("go").action(() => {});
	expect(driveMessages(prog, ["go", "--no-help"]).join("\n")).toMatch(
		/[Uu]nknown option '--no-help'/,
	);
});

test("--no-version is an unknown-option even when .version() was set", () => {
	const prog = new ProgramImpl();
	prog
		.version("1.0.0")
		.command("go")
		.action(() => {});
	expect(driveMessages(prog, ["go", "--no-version"]).join("\n")).toMatch(
		/[Uu]nknown option '--no-version'/,
	);
});
