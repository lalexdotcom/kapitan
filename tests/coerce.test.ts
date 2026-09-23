import { expect, test } from "@rstest/core";
import { coerce, MISSING } from "../src/coerce.ts";
import type { CliError } from "../src/errors.ts";

const run = (value: string | undefined, option: Parameters<typeof coerce>[1]) => {
	const errors: CliError[] = [];
	const result = coerce(value, option, undefined, "opt", errors);
	return { result, errors };
};

test("number: valid parses to a number", () => {
	expect(run("42", { type: "number" }).result).toBe(42);
});

test("number: NaN yields invalid-value and MISSING", () => {
	const { result, errors } = run("abc", { type: "number" });
	expect(result).toBe(MISSING);
	expect(errors[0].code).toBe("invalid-value");
});

test("boolean: bare (empty) is true, =false is false", () => {
	expect(run("", { type: "boolean" }).result).toBe(true);
	expect(run("false", { type: "boolean" }).result).toBe(false);
});

test("date: invalid date yields invalid-value and MISSING", () => {
	const { result, errors } = run("not-a-date", { type: "date" });
	expect(result).toBe(MISSING);
	expect(errors[0].code).toBe("invalid-value");
});

test("date: valid date parses to a Date", () => {
	const result = run("2026-07-01", { type: "date" }).result as Date;
	expect(result).toBeInstanceOf(Date);
	expect(result.getFullYear()).toBe(2026);
});

test("enum: unknown value yields invalid-enum with the option token + choices", () => {
	const { result, errors } = run("purple", { type: ["red", "green", "blue"] });
	expect(result).toBe(MISSING);
	expect(errors[0]).toMatchObject({
		code: "invalid-enum",
		message: "Invalid value 'purple' for 'opt' (choices: red|green|blue)",
		token: "opt",
		value: "purple",
	});
});

test("function type: thrown error becomes invalid-value", () => {
	const { result, errors } = run("x", {
		type: () => {
			throw new Error("boom");
		},
	});
	expect(result).toBe(MISSING);
	expect(errors[0].code).toBe("invalid-value");
});

test("array flag is ignored by coerce (accumulation lives in bind, not here)", () => {
	// comma is no longer special: coerce returns the raw string as a single value
	expect(run("a,b", { array: true }).result).toBe("a,b");
});

test("array option with a non-numeric value yields invalid-value and MISSING", () => {
	const { result, errors } = run("notanumber", { type: "number", array: true });
	expect(result).toBe(MISSING);
	expect(errors[0].code).toBe("invalid-value");
});

test("no type: identity string", () => {
	expect(run("hello", {}).result).toBe("hello");
});

test("datetime: valid string parses to a Date", () => {
	const result = run("2026-07-01 13:45:00", { type: "datetime" }).result as Date;
	expect(result).toBeInstanceOf(Date);
});

test("datetime: invalid string yields invalid-value and MISSING", () => {
	const { result, errors } = run("not-a-datetime", { type: "datetime" });
	expect(result).toBe(MISSING);
	expect(errors[0].code).toBe("invalid-value");
});

test("coerce messages use the display token verbatim (no forced -- prefix)", () => {
	const { errors } = run("x", { type: "number" }); // run() passes display 'opt'
	expect(errors[0].message).toContain("'opt'");
	expect(errors[0].message).not.toContain("'--opt'");
});
