import { expect, test } from "@rstest/core";
import { ArgvParser } from "../src/parser.ts";

test("redeclaring a canonical option name throws", () => {
	const p = new ArgvParser();
	p.setParam("out", { type: "boolean" });
	expect(() => p.setParam("out", { type: "number" })).toThrow(/already registered/i);
});

test("a long alias colliding with an existing canonical name throws (no silent shadow)", () => {
	const p = new ArgvParser();
	p.setParam("out", { type: "boolean" });
	expect(() => p.setParam("verbose", { type: "boolean", alias: ["out"] })).toThrow(
		/already registered/i,
	);
});

test("a canonical name colliding with an existing long alias throws", () => {
	const p = new ArgvParser();
	p.setParam("verbose", { type: "boolean", alias: ["out"] });
	expect(() => p.setParam("out", { type: "boolean" })).toThrow(/already registered/i);
});

test("two options sharing a short alias throw (existing behavior kept)", () => {
	const p = new ArgvParser();
	p.setParam("verbose", { type: "boolean", alias: [{ name: "v", short: true }] });
	expect(() =>
		p.setParam("version", { type: "boolean", alias: [{ name: "v", short: true }] }),
	).toThrow(/already registered/i);
});

test("a colliding later alias leaves the parser unmutated (atomic setParam)", () => {
	const p = new ArgvParser();
	p.setParam("existing", { type: "boolean", alias: [{ name: "e", short: true }] });
	expect(() =>
		p.setParam("multi", {
			type: "boolean",
			alias: [
				{ name: "m", short: true },
				{ name: "e", short: true },
			],
		}),
	).toThrow(/already registered/i);
	// 'multi' must NOT have been registered (atomic rollback): re-registering it cleanly must succeed
	expect(() => p.setParam("multi", { type: "boolean" })).not.toThrow();
});
