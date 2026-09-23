// showcase.dev.ts — kapitan visual showcase
// ─────────────────────────────────────────────────────────────────────────────
// Run (full showcase):
//   pnpm run showcase
//
// Run a single sub-scenario directly:
//   pnpm exec tsx scripts/showcase.ts --sub basic --name=Alice --port=8080
//   pnpm exec tsx scripts/showcase.ts --sub aliases -o dist/ -v
//   pnpm exec tsx scripts/showcase.ts --sub date --level=warn --since=2025-06-01
//   pnpm exec tsx scripts/showcase.ts --sub hook --name=Alice
//   pnpm exec tsx scripts/showcase.ts --sub subcommand deploy --env=prod --dry-run
//   pnpm exec tsx scripts/showcase.ts --sub error-default
//   pnpm exec tsx scripts/showcase.ts --sub error-custom --name=World

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { program } from "../src/index.ts";

const __filename = fileURLToPath(import.meta.url);

// ── ANSI helpers ──────────────────────────────────────────────────────────────
const c = {
	bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
	cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
	green: (s: string) => `\x1b[32m${s}\x1b[0m`,
	red: (s: string) => `\x1b[31m${s}\x1b[0m`,
	blue: (s: string) => `\x1b[34m${s}\x1b[0m`,
	dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
};

// ── SUB-PROCESS SCENARIO ROUTING ──────────────────────────────────────────────
// Each --sub scenario runs in its own child process → fresh program singleton.
// Mutate process.argv in-place so program.ts's `import { argv }` binding stays valid.

const subIdx = process.argv.indexOf("--sub");

if (subIdx !== -1) {
	const scenario = process.argv[subIdx + 1];
	// Drop everything between the script path and the scenario's own args.
	process.argv.splice(2, subIdx);

	switch (scenario) {
		// ── basic: required + optional + enum + number + boolean ──────────────
		case "basic": {
			program
				.version("1.0.0-showcase")
				.option("name", { required: true })
				.option("env", { type: ["dev", "staging", "prod"], default: "dev" })
				.option("port", { type: "number", default: 3000 })
				.option("verbose", { type: "boolean" })
				.action(({ options }) => {
					console.log(JSON.stringify(options, null, 2));
				});
			program.start();
			break;
		}

		// ── aliases: short flags -o / -v ──────────────────────────────────────
		case "aliases": {
			program
				.option("output", { default: "stdout", alias: [{ name: "o", short: true }] })
				.option("verbose", { type: "boolean", alias: [{ name: "v", short: true }] })
				.option("count", { type: "number", default: 1 })
				.action(({ options }) => {
					console.log(JSON.stringify(options, null, 2));
				});
			program.start();
			break;
		}

		// ── date: date + enum type options ────────────────────────────────────
		case "date": {
			program
				.option("level", { type: ["info", "warn", "error"], default: "info" })
				.option("since", { type: "date" })
				.action(({ options }) => {
					console.log(
						JSON.stringify(
							options,
							(_, v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v),
							2,
						),
					);
				});
			program.start();
			break;
		}

		// ── hook: hook runs before action ────────────────────────────────────
		case "hook": {
			const log: string[] = [];
			program
				.hook((opts) => {
					log.push(`hook ran with: ${JSON.stringify(opts)}`);
				})
				.option("name", { default: "world" })
				.action(({ options }) => {
					console.log(JSON.stringify({ options, log }, null, 2));
				});
			program.start();
			break;
		}

		// ── subcommand: parent option inherited by forked child command ───────
		case "subcommand": {
			program
				.option("verbose", { type: "boolean" })
				.command("deploy")
				.option("env", { type: ["dev", "staging", "prod"], default: "staging" })
				.option("dry-run", { type: "boolean" })
				.action(({ options }) => {
					console.log(JSON.stringify(options, null, 2));
				});
			program.start();
			break;
		}

		// ── help-version: --help / --version / subcommand --help ─────────────────
		// Root is a pure group (no root action) — bare invocation yields help automatically.
		case "help-version": {
			program
				.version("1.0.0-showcase")
				.option("verbose", { type: "boolean", description: "Enable verbose output" })
				.command("deploy")
				.description("Deploy to an environment")
				.option("env", {
					type: ["dev", "staging", "prod"],
					default: "staging",
					description: "Deploy target",
				})
				.option("dry-run", { type: "boolean", description: "Simulate without deploying" })
				.action(({ options }) => {
					console.log(JSON.stringify(options, null, 2));
				});
			program.start();
			break;
		}

		// ── error-default: missing required → stderr + exit 1 ─────────────────
		case "error-default": {
			program.option("name", { required: true }).action(({ options }) => {
				console.log(JSON.stringify(options));
			});
			program.start();
			break;
		}

		// ── error-custom: custom errorHandler → exit 2 ────────────────────────
		case "error-custom": {
			program
				.config({
					errorHandler: (msg) => {
						console.error(`[custom-error] ${msg}`);
						process.exit(2);
					},
				})
				.option("name", { required: true })
				.action(({ options }) => {
					console.log(JSON.stringify(options));
				});
			program.start();
			break;
		}
	}
} else {
	// ── FULL SHOWCASE MODE ────────────────────────────────────────────────────
	await runShowcase();
}

async function runShowcase() {
	console.log(c.bold(c.cyan("\n  kapitan — showcase.dev.ts")));
	console.log(
		c.dim("  Each scenario runs in an isolated child process with a fresh program singleton"),
	);

	async function runSpawn(
		section: number,
		title: string,
		cases: { label: string; args: string[] }[],
	): Promise<void> {
		console.log(`\n${c.bold(c.cyan("─".repeat(60)))}`);
		console.log(c.bold(c.cyan(`  ${section}. ${title}`)));
		console.log(c.bold(c.cyan("─".repeat(60))));

		for (const { label, args } of cases) {
			await new Promise<void>((resolve) => {
				const cmdStr = `tsx scripts/showcase.ts --sub ${args.join(" ")}`;
				console.log(`\n  ${c.blue("▶")} ${c.dim(label)}`);
				console.log(`    ${c.dim("$")} ${c.dim(cmdStr)}`);

				const child = spawn("node_modules/.bin/tsx", [__filename, "--sub", ...args], {
					stdio: ["ignore", "pipe", "pipe"],
				});

				let stdout = "";
				let stderr = "";
				child.stdout.on("data", (d: Buffer) => {
					stdout += d.toString();
				});
				child.stderr.on("data", (d: Buffer) => {
					stderr += d.toString();
				});

				child.on("close", (code: number | null) => {
					for (const line of stdout.trim().split("\n").filter(Boolean))
						console.log(`    ${c.green("stdout")}  ${line}`);
					for (const line of stderr.trim().split("\n").filter(Boolean))
						console.log(`    ${c.red("stderr")}  ${line}`);
					const exitStr = String(code ?? "?");
					console.log(`    ${c.dim("exit")}    ${code === 0 ? c.green(exitStr) : c.red(exitStr)}`);
					resolve();
				});
			});
		}
	}

	await runSpawn(1, "Basic options — required, enum, number, boolean", [
		{
			label: "all options provided",
			args: ["basic", "--name=Alice", "--env=staging", "--port=8080", "--verbose"],
		},
		{ label: "defaults only (env=dev, port=3000)", args: ["basic", "--name=Bob"] },
		{ label: "missing required → stderr + exit 1", args: ["basic"] },
	]);

	await runSpawn(2, "Short aliases (-o, -v)", [
		{ label: "-o=dist/ -v (short aliases)", args: ["aliases", "-o=dist/", "-v"] },
		{ label: "--output out/ (long form)", args: ["aliases", "--output=out/"] },
		{ label: "all defaults", args: ["aliases"] },
	]);

	await runSpawn(3, "Date + enum options", [
		{
			label: "--level=warn --since=2025-06-01",
			args: ["date", "--level=warn", "--since=2025-06-01"],
		},
		{ label: "defaults (level=info, no date)", args: ["date"] },
	]);

	await runSpawn(4, "Hook — runs before action", [
		{ label: "--name=Alice", args: ["hook", "--name=Alice"] },
		{ label: "default name", args: ["hook"] },
	]);

	await runSpawn(5, "Sub-command with inherited parent option", [
		{
			label: "deploy --env=prod --dry-run",
			args: ["subcommand", "deploy", "--env=prod", "--dry-run"],
		},
		{ label: "deploy defaults (env=staging)", args: ["subcommand", "deploy"] },
	]);

	await runSpawn(6, "Error handling", [
		{ label: "default handler — missing required (exit 1)", args: ["error-default"] },
		{ label: "custom errorHandler — missing required (exit 2)", args: ["error-custom"] },
		{ label: "custom errorHandler — valid input (exit 0)", args: ["error-custom", "--name=World"] },
	]);

	await runSpawn(7, "--help and --version", [
		{ label: "--help (program)", args: ["help-version", "--help"] },
		{ label: "-h (short form)", args: ["help-version", "-h"] },
		{ label: "--version", args: ["help-version", "--version"] },
		{ label: "-V (short form)", args: ["help-version", "-V"] },
		{ label: "deploy --help (subcommand)", args: ["help-version", "deploy", "--help"] },
		{ label: "deploy -h (subcommand short)", args: ["help-version", "deploy", "-h"] },
	]);

	console.log(`\n${c.bold(c.green("  ✓ showcase complete"))}\n`);
}
