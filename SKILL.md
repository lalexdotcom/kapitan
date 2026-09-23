---
name: kapitan
description: Build type-safe Node.js CLIs with the kapitan framework (a type-first, commander.js-like builder). Use when defining a command-line tool with the `kapitan` package — declaring options, arguments, nested commands, hooks, injected values, custom coercion (number/date/enum), --help/--version, or a custom error handler. Trigger on mentions of "kapitan", `import { program } from 'kapitan'`, or `program.option/.command/.action/.start`.
license: MIT
---

# kapitan — type-first CLI framework

kapitan is a commander.js-like CLI builder where every option, argument and
injected value flows through the type system, so the `action` callback receives
a fully-typed, fully-resolved payload with no casts.

## Core rules

- Only public API: the `program` singleton and the types `Program`, `Group`,
  `Command`, `CliError`. Never import from `kapitan/src/*` internals.
- Declare names in kebab-case; read them in camelCase (`--dry-run` → `options.dryRun`).
- Never annotate the `action` parameter or any function return type — TS infers them.
- Finish with `program.start()` (sync) or `program.startAsync()` (async action/hooks).

## Minimal shape

```ts
import { program } from 'kapitan';

program
  .version('1.0.0')
  .description('Greet someone.')
  .option('name', { required: true })
  .option('loud', { type: 'boolean', alias: [{ name: 'l', short: true }] })
  .action(({ options }) => {
    // options: { name: string; loud?: boolean }
    console.log(options.loud ? `HELLO ${options.name}` : `Hello ${options.name}`);
  });

program.start();
```

## What you can chain

- `.option(name, opts?)` — `{ required, default, type, array, description, alias, var }`.
  `type`: `'string'|'boolean'|'number'|'date'|'datetime'`, an enum tuple
  (`['dev','prod']`), or a custom `(v: string) => T`.
- `.argument(name, opts?)` — positionals, read via `args`.
- `.inject(name, valueOrFactory)` — always-present non-CLI value.
- `.hook(fn)` — runs before the action with resolved options (async → `startAsync`).
- `.command(name)` — leaf command (has `.action()`); `.sub(name)` — group (no action).
  Parent options and hooks are inherited by descendants.
- `.config({ dateFormat, dateTimeFormat, errorHandler })` — root only.

`--help`/`-h` are always on; `--version`/`-V` after `.version()`.

## Full reference

For the complete API, coercion rules, parsing behavior, error model and worked
examples, read **`llms-full.txt`** next to this file. Consult it before
generating non-trivial kapitan code.
