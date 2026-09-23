import { afterEach, expect, rstest, test } from "@rstest/core";
import { ArgvParser } from "../src/parser";

afterEach(() => {
	rstest.restoreAllMocks();
});

// --- ERR-01: default error handler (stderr + exit 1) ---

test("ERR-01: missing required option writes to stderr and exits with 1", () => {
	const stderrSpy = rstest.spyOn(process.stderr, "write").mockImplementation(() => true);
	const exitSpy = rstest.spyOn(process, "exit").mockImplementation(() => undefined as never);

	const parser = new ArgvParser<{ name: string }>();
	parser.setParam("name", { required: true });
	parser.parse([]);

	expect(stderrSpy).toHaveBeenCalledWith("Missing required parameter '--name'\n");
	expect(exitSpy).toHaveBeenCalledWith(1);
});

test("ERR-01: invalid enum value writes to stderr and exits with 1", () => {
	const stderrSpy = rstest.spyOn(process.stderr, "write").mockImplementation(() => true);
	const exitSpy = rstest.spyOn(process, "exit").mockImplementation(() => undefined as never);

	const parser = new ArgvParser<{ color?: string }>();
	parser.setParam("color", { type: ["red", "green", "blue"] });
	parser.parse(["--color", "purple"]);

	expect(stderrSpy).toHaveBeenCalledWith(
		"Invalid value 'purple' for '--color' (choices: red|green|blue)\n",
	);
	expect(exitSpy).toHaveBeenCalledWith(1);
});

// --- ERR-02: injectable errorHandler ---

test("ERR-02: injected errorHandler receives message, no process.exit called", () => {
	const errors: string[] = [];
	const parser = new ArgvParser<{ name: string }>();
	parser.setConfig({ errorHandler: (errs) => errors.push(...errs.map((e) => e.message)) });
	parser.setParam("name", { required: true });
	parser.parse([]);

	expect(errors).toContain("Missing required parameter '--name'");
});

test("ERR-02: injected errorHandler receives invalid enum message", () => {
	const errors: string[] = [];
	const parser = new ArgvParser<{ color?: string }>();
	parser.setConfig({ errorHandler: (errs) => errors.push(...errs.map((e) => e.message)) });
	parser.setParam("color", { type: ["red", "green", "blue"] });
	parser.parse(["--color", "purple"]);

	expect(errors).toContain("Invalid value 'purple' for '--color' (choices: red|green|blue)");
});

test("ERR-02: forked parser inherits errorHandler from parent", () => {
	const errors: string[] = [];
	const parent = new ArgvParser<{ name: string }>();
	parent.setConfig({ errorHandler: (errs) => errors.push(...errs.map((e) => e.message)) });
	parent.setParam("name", { required: true });
	const child = parent.fork();
	child.parse([]);

	expect(errors).toContain("Missing required parameter '--name'");
});
