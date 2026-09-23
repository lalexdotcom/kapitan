import { expect, test } from "@rstest/core";
import { ArgvParser } from "../src/parser";

// --- Registration tests (real assertions — green after Plan 04-01) ---

test("ALIAS-01: setParam accepts long alias without throwing", () => {
	const parser = new ArgvParser<{ outputDir?: string }>();
	expect(() => parser.setParam("output-dir", { alias: ["out"] })).not.toThrow();
});

test("ALIAS-01: setParam accepts short alias without throwing", () => {
	const parser = new ArgvParser<{ verbose?: boolean }>();
	expect(() =>
		parser.setParam("verbose", { type: "boolean", alias: [{ name: "v", short: true }] }),
	).not.toThrow();
});

test("ALIAS-04: fork() child can register new aliases independently of parent", () => {
	const parent = new ArgvParser<{ verbose?: boolean }>();
	parent.setParam("verbose", { type: "boolean", alias: [{ name: "v", short: true }] });
	const child = parent.fork();
	// Adding a new alias to child must not throw (the index was copied, not shared)
	expect(() =>
		child.setParam("debug", { type: "boolean", alias: [{ name: "d", short: true }] }),
	).not.toThrow();
});

test("D-02: duplicate long alias throws Error at registration", () => {
	const parser = new ArgvParser();
	parser.setParam("output", { alias: ["out"] });
	expect(() => parser.setParam("other", { alias: ["out"] })).toThrow(
		'Alias "--out" is already registered by option "output"',
	);
});

test("D-02: duplicate short alias throws Error at registration", () => {
	const parser = new ArgvParser();
	parser.setParam("verbose", { type: "boolean", alias: [{ name: "v", short: true }] });
	expect(() =>
		parser.setParam("version", { type: "boolean", alias: [{ name: "v", short: true }] }),
	).toThrow('Alias "-v" is already registered by option "verbose"');
});

// --- Parse assertions (real, replacing Plan 04-01 stubs) ---

test("ALIAS-02: long alias --out resolves to outputDir", () => {
	const parser = new ArgvParser<{ outputDir?: string }>();
	parser.setParam("output-dir", { alias: ["out"] });
	const result = parser.parse(["--out", "dist/"]);
	expect(result.options.outputDir).toBe("dist/");
});

test("ALIAS-02: long alias --out= form resolves to outputDir", () => {
	const parser = new ArgvParser<{ outputDir?: string }>();
	parser.setParam("output-dir", { alias: ["out"] });
	const result = parser.parse(["--out=dist/"]);
	expect(result.options.outputDir).toBe("dist/");
});

test("ALIAS-03: short alias -v resolves to verbose (bare boolean form)", () => {
	const parser = new ArgvParser<{ verbose?: boolean }>();
	parser.setParam("verbose", { type: "boolean", alias: [{ name: "v", short: true }] });
	const result = parser.parse(["-v"]);
	expect(result.options.verbose).toBe(true);
});

test("ALIAS-03: short alias -v=true resolves via = form", () => {
	const parser = new ArgvParser<{ verbose?: boolean }>();
	parser.setParam("verbose", { type: "boolean", alias: [{ name: "v", short: true }] });
	const result = parser.parse(["-v=true"]);
	expect(result.options.verbose).toBe(true);
});

test("ALIAS-03: short alias -o value resolves via space-separated form", () => {
	const parser = new ArgvParser<{ output?: string }>();
	parser.setParam("output", { alias: [{ name: "o", short: true }] });
	const result = parser.parse(["-o", "dist/"]);
	expect(result.options.output).toBe("dist/");
});

test("ALIAS-04: forked child parser resolves parent short alias -v", () => {
	const parent = new ArgvParser<{ verbose?: boolean }>();
	parent.setParam("verbose", { type: "boolean", alias: [{ name: "v", short: true }] });
	const child = parent.fork();
	const result = child.parse(["-v"]);
	expect(result.options.verbose).toBe(true);
});
