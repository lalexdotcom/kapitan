import { expect, test } from "@rstest/core";
import { program } from "../src/index";
import { ArgvParser } from "../src/parser";

test("program is defined", () => {
	expect(program).toBeDefined();
});

test("parse: --out dist collects value and leaves no stray positional", () => {
	const parser = new ArgvParser<{ out?: string }>();
	parser.setParam("out", {});
	const { commands, options } = parser.parse(["--out", "dist"]);
	expect(commands).toEqual([]);
	expect(options.out).toBe("dist");
});

test("parse: --out dist deploy keeps deploy as the only positional", () => {
	const parser = new ArgvParser<{ out?: string }>();
	parser.setParam("out", {});
	const { commands, options } = parser.parse(["--out", "dist", "deploy"]);
	expect(options.out).toBe("dist");
	expect(commands).toEqual(["deploy"]);
});

test("parse: var override applies to required + default lookups", () => {
	const parser = new ArgvParser<{ level: number }>();
	parser.setParam("log-level", { var: "level", type: "number", default: 3 });
	const { options } = parser.parse([]);
	expect(options.level).toBe(3);
});
