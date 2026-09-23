// packages/libs/node/kapitan/tests/builtins.test.ts
import { expect, test } from "@rstest/core";
import { ArgvParser, BUILTIN_HELP, BUILTIN_VERSION } from "../src/parser.ts";

test("registry resolves help / -h rawNames to the built-in help canonical (arity 0)", () => {
	const r = new ArgvParser().registry();
	expect(r.resolve("help")).toBe(BUILTIN_HELP);
	expect(r.resolve("-h")).toBe(BUILTIN_HELP);
	expect(r.arity(BUILTIN_HELP)).toBe(0);
});

test("version built-in is gated by enableVersionBuiltin()", () => {
	const p = new ArgvParser();
	expect(p.registry().resolve("version")).toBeUndefined();
	expect(p.registry().resolve("-V")).toBeUndefined();
	p.enableVersionBuiltin();
	expect(p.registry().resolve("version")).toBe(BUILTIN_VERSION);
	expect(p.registry().resolve("-V")).toBe(BUILTIN_VERSION);
	expect(p.registry().arity(BUILTIN_VERSION)).toBe(0);
});

test("a consumer option named help wins over the built-in", () => {
	const p = new ArgvParser();
	p.setParam("help", { type: "boolean" });
	expect(p.registry().resolve("help")).toBe("help");
});

test("a consumer -h alias wins for -h; --help still resolves to the built-in (per-flag)", () => {
	const p = new ArgvParser();
	p.setParam("hostname", { alias: [{ name: "h", short: true }] });
	expect(p.registry().resolve("-h")).toBe("hostname");
	expect(p.registry().resolve("help")).toBe(BUILTIN_HELP);
});

test("an injected reservation of help shadows the built-in (resolves undefined)", () => {
	const p = new ArgvParser();
	p.setParam("help", { injected: "x" });
	expect(p.registry().resolve("help")).toBeUndefined();
});

test("fork inherits version-built-in enablement", () => {
	const parent = new ArgvParser();
	parent.enableVersionBuiltin();
	expect(parent.fork().registry().resolve("version")).toBe(BUILTIN_VERSION);
});

test("builtinListing: both help forms on by default, version off until enabled", () => {
	const p = new ArgvParser();
	expect(p.builtinListing()).toEqual({
		help: { short: true, long: true },
		version: { short: false, long: false },
	});
	p.enableVersionBuiltin();
	expect(p.builtinListing().version).toEqual({ short: true, long: true });
});

test("builtinListing is per-flag: owning -h suppresses only the short help form", () => {
	const p = new ArgvParser();
	p.setParam("hostname", { alias: [{ name: "h", short: true }] }); // owns -h
	expect(p.builtinListing().help).toEqual({ short: false, long: true });
});

test("builtinListing is per-flag: owning --version suppresses only the long version form", () => {
	const p = new ArgvParser();
	p.enableVersionBuiltin();
	p.setParam("version", { type: "boolean" }); // owns --version (long)
	expect(p.builtinListing().version).toEqual({ short: true, long: false });
});

test("builtinListing is per-flag: owning -V suppresses only the short version form", () => {
	const p = new ArgvParser();
	p.enableVersionBuiltin();
	p.setParam("uptime", { alias: [{ name: "V", short: true }] }); // owns -V
	expect(p.builtinListing().version).toEqual({ short: false, long: true });
});
