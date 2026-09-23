// packages/libs/node/kapitan/tests/builder-guards.test.ts
import { expect, test } from "@rstest/core";
import { ProgramCommandImpl } from "../src/command.ts";
import { ArgvParser } from "../src/parser.ts";
import { ProgramImpl } from "../src/program.ts";

// Each test creates a fresh isolated node via makeNode() — no cross-test leakage.
const makeNode = () => new ProgramCommandImpl(new ArgvParser());

test("action() throws when the node already has children", () => {
	const grp = makeNode();
	grp.command("leaf");
	expect(() => (grp as unknown as { action: (f: () => void) => void }).action(() => {})).toThrow(
		/cannot have an action/i,
	);
});

test("action() throws when already has an action", () => {
	const leaf = makeNode();
	leaf.action(() => {});
	expect(() => (leaf as unknown as { action: (f: () => void) => void }).action(() => {})).toThrow(
		/already has an action/i,
	);
});

test("command() throws when the node already has an action", () => {
	const leaf = makeNode();
	leaf.action(() => {});
	expect(() => (leaf as unknown as { command: (n: string) => unknown }).command("x")).toThrow(
		/cannot have sub-commands/i,
	);
});

test("sub() throws when the node already has an action", () => {
	const leaf = makeNode();
	leaf.action(() => {});
	expect(() => (leaf as unknown as { sub: (n: string) => unknown }).sub("x")).toThrow(
		/cannot have sub-commands/i,
	);
});

test("description() throws when called twice", () => {
	const node = makeNode();
	node.description("first");
	expect(() => node.description("second")).toThrow(/description already set/i);
});

test("version() throws on a non-root node (method absent — TypeError)", () => {
	const grp = makeNode();
	// version() does not exist on ProgramCommandImpl — calling it on a cast reference throws a
	// TypeError naturally (not a function). No message assertion is possible here.
	// FUTURE REFACTOR NOTE: if version() is ever moved onto the base class, this bare .toThrow()
	// must be replaced with an explicit guard assertion (e.g. .toThrow(/before any/i)) so the
	// structural TypeError is not silently swallowed.
	expect(() => (grp as unknown as { version: (v: string) => unknown }).version("1.0.0")).toThrow();
});

test("version() throws when called after body has been entered on root", () => {
	const root = new ProgramImpl();
	// Register a body-entry call to set bodyEntered = true.
	(root as unknown as { option: (n: string) => void }).option("version-guard-test-opt");
	expect(() => (root as unknown as { version: (v: string) => unknown }).version("1.0.0")).toThrow(
		/before any/i,
	);
});

test("version() succeeds when called before any body entry on root", () => {
	const root = new ProgramImpl();
	// Must not throw — version before any option/command/action is the valid path.
	expect(() =>
		(root as unknown as { version: (v: string) => unknown }).version("1.0.0"),
	).not.toThrow();
});

test("command() throws when the same subcommand name is declared twice (no silent overwrite)", () => {
	const grp = makeNode();
	grp.command("dup");
	// Re-declaring the same name must throw, not silently replace the existing group and its subtree.
	expect(() => grp.command("dup")).toThrow(/already/i);
});

test("sub() throws when the same subcommand name is declared twice", () => {
	const grp = makeNode();
	grp.sub("dup");
	expect(() => grp.sub("dup")).toThrow(/already/i);
});

test('redeclaration error shows the full ordered path from the root ("program" + parent keys)', () => {
	const root = new ProgramImpl();
	const grp = root.command("grp");
	// root-level duplicate → the parent is the root → "program"
	expect(() => root.command("grp")).toThrow(/"grp" is already declared in program\./);

	// nested duplicate → the full ordered path down to the parent
	const sub1 = grp.command("sub1");
	sub1.command("leaf");
	expect(() => sub1.command("leaf")).toThrow(/"leaf" is already declared in program grp sub1\./);
});
