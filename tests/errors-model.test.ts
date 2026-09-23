import { expect, rstest, test } from "@rstest/core";
import { reportErrors } from "../src/errors.ts";

test("reportErrors with a custom handler delivers all errors and does not exit", () => {
	const seen: string[] = [];
	const exit = rstest.spyOn(process, "exit").mockImplementation(() => undefined as never);
	reportErrors(
		[
			{ code: "unknown-option", message: "Unknown option '--x'", token: "--x" },
			{ code: "missing-value", message: "Missing value for '--y'", token: "--y" },
		],
		(errs) => seen.push(...errs.map((e) => e.message)),
	);
	expect(seen).toEqual(["Unknown option '--x'", "Missing value for '--y'"]);
	expect(exit).not.toHaveBeenCalled();
	exit.mockRestore();
});

test("reportErrors with no handler writes every message to stderr then exits once", () => {
	const written: string[] = [];
	const stderr = rstest.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
		written.push(String(chunk));
		return true;
	});
	const exit = rstest.spyOn(process, "exit").mockImplementation(() => undefined as never);
	reportErrors([
		{ code: "unknown-option", message: "a", token: "a" },
		{ code: "missing-value", message: "b", token: "b" },
	]);
	expect(written).toEqual(["a\n", "b\n"]);
	expect(exit).toHaveBeenCalledTimes(1);
	expect(exit).toHaveBeenCalledWith(1);
	stderr.mockRestore();
	exit.mockRestore();
});
