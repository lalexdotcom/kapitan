// packages/libs/node/kapitan/tests/tokenizer.test.ts
import { expect, test } from "@rstest/core";
import type { TokenizerRegistry } from "../src/tokenizer.ts";
import { classifyElement, tokenize } from "../src/tokenizer.ts";

// Registry: `out` (value option, canonical `out`), `-v` (boolean), `num` (value option).
const registry: TokenizerRegistry = {
	resolve: (raw) => (raw === "out" || raw === "-v" || raw === "num" ? raw : undefined),
	arity: (name) => (name === "-v" ? 0 : 1),
};

test("attached form --out=dist", () => {
	expect(tokenize(["--out=dist"], registry)).toEqual([
		{ kind: "option", name: "out", value: "dist", raw: "--out=dist" },
	]);
});

test("spaced form --out dist consumes the next element", () => {
	expect(tokenize(["--out", "dist"], registry)).toEqual([
		{ kind: "option", name: "out", value: "dist", raw: "--out" },
	]);
});

test("spaced value that is a flag is NOT consumed (missing-value)", () => {
	const tokens = tokenize(["--out", "-v"], registry);
	expect(tokens[0]).toMatchObject({ kind: "error", error: { code: "missing-value" } });
	expect(tokens[1]).toMatchObject({ kind: "option", name: "-v" });
});

test("negative number IS consumed as a spaced value", () => {
	expect(tokenize(["--num", "-5"], registry)).toEqual([
		{ kind: "option", name: "num", value: "-5", raw: "--num" },
	]);
});

test("bare boolean flag -v has undefined value", () => {
	expect(tokenize(["-v"], registry)).toEqual([
		{ kind: "option", name: "-v", value: undefined, raw: "-v" },
	]);
});

test("unknown long option is an error, not a positional", () => {
	expect(tokenize(["--nope"], registry)[0]).toMatchObject({
		kind: "error",
		error: { code: "unknown-option" },
	});
});

test("classifyElement returns a tokens array", () => {
	const registry = {
		resolve: (n: string) => (n === "out" ? "out" : undefined),
		arity: () => 1 as const,
	};
	const { tokens, next } = classifyElement(["--out", "dist"], 0, registry);
	expect(Array.isArray(tokens)).toBe(true);
	expect(tokens).toHaveLength(1);
	expect(tokens[0]).toMatchObject({ kind: "option", name: "out", value: "dist" });
	expect(next).toBe(2);
});

test("lone negative number with no awaiting option is a positional", () => {
	expect(tokenize(["-5"], registry)).toEqual([{ kind: "positional", value: "-5" }]);
});

test("positional token passes through, empty string is positional", () => {
	expect(tokenize(["deploy", ""], registry)).toEqual([
		{ kind: "positional", value: "deploy" },
		{ kind: "positional", value: "" },
	]);
});

test("--no-flag on a boolean sets value false", () => {
	const boolReg: TokenizerRegistry = {
		resolve: (r) => (r === "v" ? "v" : undefined),
		arity: () => 0,
	};
	expect(tokenize(["--no-v"], boolReg)).toEqual([
		{ kind: "option", name: "v", value: "false", raw: "--no-v" },
	]);
});

// Unit-test fixture — maps each short flag to a canonical long-name, like the real registry
// (canonicals live in #params; short flags are aliases). `num` is the only value-taking (arity-1) option.
const clusterRegistry = {
	resolve: (n: string) =>
		({ "-a": "all", "-b": "brief", "-c": "color", "-n": "num", "-ab": "ab-flag" })[n],
	arity: (c: string) => (c === "num" ? 1 : 0) as 0 | 1,
};
const names = (ts: ReturnType<typeof classifyElement>["tokens"]) =>
	ts.map((t) =>
		t.kind === "option"
			? `${t.name}:${t.value ?? ""}`
			: t.kind === "error"
				? `err:${t.error.code}`
				: `pos:${t.value}`,
	);

test("cluster: -abc → three flags", () => {
	const { tokens, next } = classifyElement(["-abc"], 0, clusterRegistry);
	expect(names(tokens)).toEqual(["all:", "brief:", "color:"]);
	expect(next).toBe(1);
});

test("cluster: -n5 → -n 5 (attached value)", () => {
	const { tokens, next } = classifyElement(["-n5"], 0, clusterRegistry);
	expect(names(tokens)).toEqual(["num:5"]);
	expect(next).toBe(1);
});

test("cluster: -abn5 → two flags + -n 5", () => {
	expect(names(classifyElement(["-abn5"], 0, clusterRegistry).tokens)).toEqual([
		"all:",
		"brief:",
		"num:5",
	]);
});

test("cluster: -nab → -n with rest as value", () => {
	expect(names(classifyElement(["-nab"], 0, clusterRegistry).tokens)).toEqual(["num:ab"]);
});

test("cluster: -an=5 → -a then -n 5 (leading = stripped)", () => {
	expect(names(classifyElement(["-an=5"], 0, clusterRegistry).tokens)).toEqual(["all:", "num:5"]);
});

test("cluster: -abn (terminal value char) consumes the next arg", () => {
	const { tokens, next } = classifyElement(["-abn", "val"], 0, clusterRegistry);
	expect(names(tokens)).toEqual(["all:", "brief:", "num:val"]);
	expect(next).toBe(2);
});

test("cluster: unknown char mid-cluster → prefix flags + unknown-option, then stop", () => {
	expect(names(classifyElement(["-ax"], 0, clusterRegistry).tokens)).toEqual([
		"all:",
		"err:unknown-option",
	]);
});

test("cluster: terminal value char with no next value → missing-value", () => {
	expect(names(classifyElement(["-abn"], 0, clusterRegistry).tokens)).toEqual([
		"all:",
		"brief:",
		"err:missing-value",
	]);
});

test("whole-match precedence: registered -ab typed alone → the -ab option", () => {
	expect(names(classifyElement(["-ab"], 0, clusterRegistry).tokens)).toEqual(["ab-flag:"]);
});

test("whole-match miss falls back to single-char cluster (-ab not consulted inside -abc)", () => {
	expect(names(classifyElement(["-abc"], 0, clusterRegistry).tokens)).toEqual([
		"all:",
		"brief:",
		"color:",
	]);
});

test("negative number -5 stays positional", () => {
	expect(names(classifyElement(["-5"], 0, clusterRegistry).tokens)).toEqual(["pos:-5"]);
});
