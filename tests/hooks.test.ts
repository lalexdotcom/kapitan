// packages/libs/node/kapitan/tests/hooks.test.ts
import { afterEach, expect, rstest, test } from "@rstest/core";
import { ProgramImpl } from "../src/program.ts";

afterEach(() => {
	rstest.restoreAllMocks();
});

// Set argv then call start() on a ProgramImpl (mirrors positionals.test.ts).
function driveStart(prog: ProgramImpl, argvTail: string[]) {
	const spy = rstest.spyOn(process, "argv", "get").mockReturnValue(["node", "cli", ...argvTail]);
	prog.start();
	spy.mockRestore();
}

test("a group hook runs before a descendant leaf action (ancestor→leaf order)", () => {
	const order: string[] = [];
	const root = new ProgramImpl();
	const remote = root.command("remote");
	remote.hook(() => order.push("group-hook"));
	const add = remote.command("add");
	add.action(() => order.push("action"));

	driveStart(root, ["remote", "add"]);

	expect(order).toEqual(["group-hook", "action"]);
});

test("multi-level: root → mid group → leaf hooks all run outermost-first, then action", () => {
	const order: string[] = [];
	const root = new ProgramImpl();
	root.hook(() => order.push("root"));
	const mid = root.command("mid");
	mid.hook(() => order.push("mid"));
	const leaf = mid.command("leaf");
	leaf.hook(() => order.push("leaf"));
	leaf.action(() => order.push("action"));

	driveStart(root, ["mid", "leaf"]);

	expect(order).toEqual(["root", "mid", "leaf", "action"]);
});

test("a leaf's own multiple hooks run in declaration order, after ancestor hooks", () => {
	const order: string[] = [];
	const root = new ProgramImpl();
	const g = root.command("g");
	g.hook(() => order.push("group"));
	const leaf = g.command("run");
	leaf.hook(() => order.push("leaf-1"));
	leaf.hook(() => order.push("leaf-2"));
	leaf.action(() => order.push("action"));

	driveStart(root, ["g", "run"]);

	expect(order).toEqual(["group", "leaf-1", "leaf-2", "action"]);
});

test("a group hook is inherited by every descendant leaf", () => {
	const seen: string[] = [];
	const root = new ProgramImpl();
	const g = root.command("g");
	g.hook(() => seen.push("hook"));
	g.command("a").action(() => seen.push("a"));
	g.command("b").action(() => seen.push("b"));

	driveStart(root, ["g", "a"]);
	driveStart(root, ["g", "b"]);

	expect(seen).toEqual(["hook", "a", "hook", "b"]);
});

test("a sibling group's hook does NOT run for a leaf outside it", () => {
	const order: string[] = [];
	const root = new ProgramImpl();
	const a = root.command("a");
	a.hook(() => order.push("a-hook"));
	a.command("x").action(() => order.push("a-x"));
	const b = root.command("b");
	b.command("y").action(() => order.push("b-y"));

	driveStart(root, ["b", "y"]);

	expect(order).toEqual(["b-y"]); // a-hook must NOT appear
});

test("a hook declared before options still receives the fully-resolved options (superset)", () => {
	let received: Record<string, unknown> | undefined;
	const root = new ProgramImpl();
	const g = root.command("g");
	g.option("shared", {}); // group-level option, inherited by the leaf
	g.hook((options) => {
		received = { ...options };
	});
	const leaf = g.command("run");
	leaf.option("local", {});
	leaf.action(() => {});

	driveStart(root, ["g", "run", "--shared", "S", "--local", "L"]);

	// hook is declared before the leaf's own option yet sees the full resolved object (add-only §7 → sound)
	expect(received).toEqual({ shared: "S", local: "L" });
});

test("startAsync awaits ancestor then leaf hooks in order, before the action", async () => {
	const order: string[] = [];
	const tick = () => new Promise<void>((r) => setTimeout(r, 0));
	const root = new ProgramImpl();
	const g = root.command("g");
	g.hook(async () => {
		await tick();
		order.push("group");
	});
	const leaf = g.command("run");
	leaf.hook(async () => {
		await tick();
		order.push("leaf");
	});
	leaf.action(() => order.push("action"));

	const spy = rstest.spyOn(process, "argv", "get").mockReturnValue(["node", "cli", "g", "run"]);
	await root.startAsync();
	spy.mockRestore();

	expect(order).toEqual(["group", "leaf", "action"]);
});

test("start() throws on an async hook, directing to startAsync (like an async action)", () => {
	const root = new ProgramImpl();
	const g = root.command("g");
	g.hook(async () => {});
	const leaf = g.command("run");
	leaf.action(() => {});

	expect(() => driveStart(root, ["g", "run"])).toThrow(/startAsync/i);
});
