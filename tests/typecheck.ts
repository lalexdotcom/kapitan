import { program } from "../src/index";

// required + default + optional boolean
program
	.option("count", { type: "number", required: true })
	.option("label", { default: "default-value" })
	.option("verbose", { type: "boolean" })
	.action(({ options }) => {
		const count: number = options.count;
		const label: string = options.label;
		const verbose: boolean | undefined = options.verbose;
		void count;
		void label;
		void verbose;
	});

// kebab-case key + var override
program
	.option("output-dir")
	.option("log-level", { var: "level", type: "number" })
	.action(({ options }) => {
		const outputDir: string | undefined = options.outputDir;
		const level: number | undefined = options.level;
		void outputDir;
		void level;
	});

// custom parser + array option
program
	.option("retries", { type: (value) => Number.parseInt(value, 10) })
	.option("tags", { array: true })
	.action(({ options }) => {
		const retries: number | undefined = options.retries;
		const tags: string[] | undefined = options.tags;
		void retries;
		void tags;
	});

// inject static + inject factory values
program
	.inject("env", "prod")
	.inject("started-at", () => new Date())
	.action(({ options }) => {
		const env: string = options.env;
		const startedAt: Date = options.startedAt;
		void env;
		void startedAt;
	});

// subcommand inheritance
program
	.option("workspace", { required: true })
	.command("serve")
	.option("port", { type: "number", required: true })
	.action(({ options }) => {
		const workspace: string = options.workspace;
		const port: number = options.port;
		void workspace;
		void port;
	});

program
	.option("token", { required: true })
	.command("login")
	.option("user", { required: true })
	.action(({ options }) => {
		const user: string = options.user;
		void user;
	});

// literal enum inference without `as const`
program.option("level", { type: ["debug", "info", "warn"] }).action(({ options }) => {
	const level: "debug" | "info" | "warn" | undefined = options.level;
	void level;
});

// inject over an existing camel key is now add-only — redeclaring is rejected:
program
	.option("mode")
	// @ts-expect-error — 'mode' already declared (add-only, Task 2)
	.inject("mode", 42);

// action receives the resolved command path
program.command("deploy").action(({ command, options }) => {
	const c: string | undefined = command;
	void c;
	void options;
});

// action receives an always-present raw passthrough array (field name: `rest`)
program.command("exec").action(({ rest }) => {
	const p: string[] = rest;
	void p;
});

// ── Task-2 add-only poison assertions ───────────────────────────────────────

// redeclaring the same option name is rejected:
program
	.command("dup")
	.option("force", { type: "boolean" })
	// @ts-expect-error — 'force' already declared (add-only)
	.option("force", { type: "number" });

// inject cannot re-key an existing option:
program
	.command("dup2")
	.option("token", { type: "string" })
	// @ts-expect-error — 'token' already declared
	.inject("token", () => "x");

// distinct names still compose fine:
program
	.command("ok")
	.option("a", { type: "boolean" })
	.option("b", { type: "number" })
	.action(() => {});

// inherited key cannot be redeclared on a leaf:
program
	.sub("grp")
	.option("shared", { type: "boolean" })
	.command("leaf")
	// @ts-expect-error — 'shared' inherited from the group
	.option("shared", { type: "number" });

// ── Task-1 node-kind assertions ──────────────────────────────────────────────

// A leaf compiles with options + action, no sub/command:
program
	.command("build")
	.option("minify", { type: "boolean" })
	.action(({ options }) => {
		const _b: boolean | undefined = options.minify;
	});

// A group compiles with sub/command, shared option, no action:
program
	.sub("serve")
	.option("port", { type: "number" })
	.command("frontend")
	.action(({ options }) => {
		const _p: number | undefined = options.port; // inherited from the group
	});

// @ts-expect-error — a group has no action()
program.sub("x").action(() => {});

// @ts-expect-error — a leaf has no sub()
program.command("x").sub("y");

// @ts-expect-error — a leaf has no command()
program.command("x").command("y");

// ── Phase 4: hooks capture the options declared-so-far (add-only superset at runtime) ──
program
	.option("host", { required: true })
	.hook((options) => {
		// the hook sees the option declared before it, typed
		const host: string = options.host;
		void host;
	})
	.option("port", { type: "number" })
	.action(({ options }) => {
		const port: number | undefined = options.port;
		void port;
	});

// a hook captures declared-so-far, NOT options declared after it
program
	.option("alpha")
	.hook((options) => {
		// @ts-expect-error — 'beta' is declared after this hook; not yet in the captured type
		void options.beta;
	})
	.option("beta");

// async hooks are a supported, typed shape (awaited by startAsync; start() rejects them at runtime):
program
	.option("token", { required: true })
	.hook(async (options) => {
		await Promise.resolve(options.token);
	})
	.action(() => {});

// @ts-expect-error — description() is not chainable twice
program.command("x").description("a").description("b");

// @ts-expect-error — version() is root-only (not on a group)
program.sub("x").version("1.0.0");

// @ts-expect-error — version() must precede the body (after option it is gone)
program.option("x").version("1.0.0");

// version() is allowed right after description() on the root:
program
	.description("root")
	.version("1.0.0")
	.command("go")
	.action(() => {});

// …and the reverse order composes too (version() then description()):
program
	.version("2.0.0")
	.description("root")
	.command("go2")
	.action(() => {});

// @ts-expect-error — version() is one-shot (gone after the first call)
program.version("1.0.0").version("2.0.0");

// @ts-expect-error — description() is one-shot (gone after the first call)
program.description("a").description("b");

// @ts-expect-error — description() is gone once the body has been entered
program.option("late-desc-opt").description("too late");

// ── Task-3 reserved-flags accumulator assertions ─────────────────────────────

// two options sharing a short flag are rejected at compile time:
program
	.command("flagdup")
	.option("verbose", { type: "boolean", alias: [{ name: "v", short: true }] })
	// @ts-expect-error — short flag -v already taken
	.option("version", { type: "boolean", alias: [{ name: "v", short: true }] });

// two options sharing a long alias are rejected:
program
	.command("flagdup2")
	.option("output", { type: "string", alias: ["out"] })
	// @ts-expect-error — long alias --out already taken
	.option("verbose", { type: "boolean", alias: ["out"] });

// a long alias colliding with an existing option's long flag is rejected:
program
	.command("shadow")
	.option("out", { type: "boolean" })
	// @ts-expect-error — --out already taken by the 'out' option
	.option("verbose", { type: "boolean", alias: ["out"] });

// distinct flags compose:
program
	.command("flagok")
	.option("verbose", { type: "boolean", alias: [{ name: "v", short: true }] })
	.option("version", { type: "boolean", alias: [{ name: "V", short: true }] })
	.action(() => {});

// ── Task-P2-3 inject-grows-R assertions (I-1 gap fix) ───────────────────────

// I-1 regression (no-var form): inject reserves --NAME, so option with same name is rejected:
program
	.command("i1a")
	.inject("dup", 1)
	// @ts-expect-error — 'dup' name already taken by inject
	.option("dup", { type: "string" });

// I-1 regression (VAR form — the actual gap): inject reserves --NAME in R, so the var-overload
// flag guard catches it too:
program
	.command("i1b")
	.inject("dup", 1)
	// @ts-expect-error — CLI name 'dup' already reserved by inject
	.option("dup", { type: "string", var: "other" });

// M-1 coverage (var-overload FLAG collision, previously untested):
program
	.command("m1")
	.option("verbose", { type: "boolean", alias: [{ name: "v", short: true }] })
	// @ts-expect-error — short flag -v already taken
	.option("ver", { type: "boolean", var: "ver", alias: [{ name: "v", short: true }] });

// NO-false-positive guard: distinct CLI names with distinct VAR keys must remain legal:
program
	.command("okvar")
	.option("foo", { type: "string", var: "bar" })
	.option("bar", { type: "string", var: "baz" })
	.action(() => {});

// ── Phase 3 Task 1: positional argument assertions ───────────────────────────

// required + optional + variadic positionals typed into action `args`:
program
	.command("cp")
	.argument("source", { required: true })
	.argument("dest", { required: true })
	.argument("extra", { array: true })
	.action(({ args }) => {
		const _s: string = args.source; // required → string
		const _d: string = args.dest;
		const _e: string[] = args.extra; // variadic → string[]
		void _s;
		void _d;
		void _e;
	});

// optional single positional is `| undefined`:
program
	.command("greet")
	.argument("name")
	.action(({ args }) => {
		const _n: string | undefined = args.name; // ok
		// @ts-expect-error — a bare positional is optional (string | undefined), not plain string
		const _bad: string = args.name;
		void _n;
		void _bad;
	});

// number-typed positional coerces the arg type:
program
	.command("rep")
	.argument("count", { required: true, type: "number" })
	.action(({ args }) => {
		const _c: number = args.count;
		void _c;
	});

// @ts-expect-error — a group has no argument()
program.sub("g").argument("x");

// --- characterization: behaviors the type-dedup refactor must preserve ---

// grows threads options + args into the action, on a leaf and on the root-as-leaf:
program
	.command("cz")
	.option("flag", { type: "boolean" })
	.argument("src", { required: true })
	.argument("rest", { array: true })
	.action(({ options, args }) => {
		const _f: boolean | undefined = options.flag;
		const _s: string = args.src;
		const _r: string[] = args.rest;
		void _f;
		void _s;
		void _r;
	});

// ── Repeated (array) options: element[] with the usual optionality rule ──
program
	.option("tag", { array: true })
	.option("port", { type: "number", array: true, required: true })
	.option("mode", { type: ["dev", "prod"], array: true, default: [] })
	.action(({ options }) => {
		const tag: string[] | undefined = options.tag; // optional array → | undefined
		const port: number[] = options.port; // required array → non-optional
		const mode: ("dev" | "prod")[] = options.mode; // default array → non-optional enum[]
		void tag;
		void port;
		void mode;
	});

// an optional array option is `T[] | undefined` — not assignable to a bare `T[]`:
program.option("maybe", { array: true }).action(({ options }) => {
	// @ts-expect-error — `string[] | undefined` is not assignable to `string[]`
	const notOptional: string[] = options.maybe;
	void notOptional;
});

// ── config(): date/datetime formats accept only known fecha tokens ───────────

// valid formats compile (fecha / moment-style tokens):
program.config({ dateFormat: "YYYY-MM-DD", dateTimeFormat: "YYYY-MM-DD HH:mm:ss" });
program.config({ dateFormat: "DD/MM/YYYY" });
program.config({ dateTimeFormat: "DD/MM/YYYY hh:mm:ss A" }); // 12h + AM/PM
program.config({ dateFormat: "YYYYMMDD" }); // separators are optional

// @ts-expect-error — 'yyyy'/'dd' are the date-fns habit; fecha tokens are uppercase
program.config({ dateFormat: "yyyy-MM-dd" });

// @ts-expect-error — 'HH' is a time token, not allowed in a date-only format
program.config({ dateFormat: "YYYY-MM-DD HH:mm" });

// @ts-expect-error — 'x' is not a supported separator
program.config({ dateFormat: "YYYYxMMxDD" });

// @ts-expect-error — 'dddd' (localized day name) is not in the supported subset
program.config({ dateFormat: "dddd" });

// the 'js' sentinel is accepted on both formats (delegates to new Date()):
program.config({ dateFormat: "js" });
program.config({ dateTimeFormat: "js" });

// @ts-expect-error — sentinel is exactly 'js'; a lookalike is still token-validated
program.config({ dateFormat: "json" });
