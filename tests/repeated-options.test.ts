// packages/libs/node/kapitan/tests/repeated-options.test.ts
import { expect, test } from "@rstest/core";
import { ProgramCommandImpl } from "../src/command.ts";
import { ArgvParser } from "../src/parser.ts";

const makeRoot = () => new ProgramCommandImpl(new ArgvParser());
type Opt = (n: string, o: object) => void;

function bindArgv(root: ProgramCommandImpl<Record<string, unknown>>, argv: string[]) {
	const { optionTokens, errors } = root.descend(argv);
	const collected = [...errors];
	const options = root.bindOptions(optionTokens, collected);
	return { options, errors: collected };
}

test("array option accumulates one value per occurrence", () => {
	const root = makeRoot();
	(root.option as Opt)("tag", { array: true });
	const { options, errors } = bindArgv(root, ["--tag", "a", "--tag", "b"]);
	expect(errors).toEqual([]);
	expect(options).toEqual({ tag: ["a", "b"] });
});

test("array option with a single occurrence yields a one-element array", () => {
	const root = makeRoot();
	(root.option as Opt)("tag", { array: true });
	expect(bindArgv(root, ["--tag", "a"]).options).toEqual({ tag: ["a"] });
});

test("comma is no longer special for array options", () => {
	const root = makeRoot();
	(root.option as Opt)("tag", { array: true });
	expect(bindArgv(root, ["--tag", "a,b"]).options).toEqual({ tag: ["a,b"] });
});

test("each array occurrence is coerced individually (number)", () => {
	const root = makeRoot();
	(root.option as Opt)("n", { type: "number", array: true });
	expect(bindArgv(root, ["--n", "1", "--n", "2"]).options).toEqual({ n: [1, 2] });
});

test("a repeated non-array option is a duplicate-option error (first value kept, single error)", () => {
	const root = makeRoot();
	(root.option as Opt)("out", {});
	const { options, errors } = bindArgv(root, ["--out", "a", "--out", "b"]);
	expect(errors).toHaveLength(1);
	expect(errors[0].code).toBe("duplicate-option");
	expect(options.out).toBe("a"); // first occurrence retained, not last-wins
});

test("absent optional array option is undefined (not [])", () => {
	const root = makeRoot();
	(root.option as Opt)("tag", { array: true });
	expect(bindArgv(root, []).options.tag).toBeUndefined();
});

test("required array option absent → missing-required", () => {
	const root = makeRoot();
	(root.option as Opt)("tag", { array: true, required: true });
	expect(bindArgv(root, []).errors.some((e) => e.code === "missing-required")).toBe(true);
});

test("a repeated non-array option errors even if the first occurrence fails coercion", () => {
	const root = makeRoot();
	(root.option as Opt)("port", { type: "number" });
	const { errors } = bindArgv(root, ["--port", "bad", "--port", "8080"]);
	expect(errors.some((e) => e.code === "duplicate-option")).toBe(true);
});

test("absent array option with default: [] yields the default", () => {
	const root = makeRoot();
	(root.option as Opt)("mode", { array: true, default: [] });
	expect(bindArgv(root, []).options.mode).toEqual([]);
});
