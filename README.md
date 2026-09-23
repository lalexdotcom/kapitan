# kapitan

> Same command line. Fully typed. Higher rank — meet kapitan.

A small, **type-first** CLI framework for Node.js — commander.js-like ergonomics,
but every option, argument and injected value flows through the type system, so
your action handler receives a fully-typed, fully-resolved payload with zero
casts.

## Features
- **Ships compiled** — ESM JavaScript with type declarations; runs on
  Node.js ≥ 20.19 with no TypeScript runtime required.
- **One tiny dependency** — [`fecha`](https://github.com/taylorhakes/fecha)
  (~2 KB) for date and datetime parsing.
- **Fluent, order-free builder** — options, arguments, hooks and commands can be
  declared in any order; the resolved types grow with every declaration.
- **Validated coercion** — numbers, dates, datetimes, enums and custom parsers
  fail with structured, user-facing errors instead of `NaN` or `Invalid Date`.
- **Compile-time date formats** — date and datetime format strings are checked
  by the type system, so a miscased token is a type error, not a runtime surprise.
- **Nested commands** — command groups at any depth, with parent options and
  hooks inherited by every descendant.
- **Hooks** — sync or async, run before the action from ancestor to leaf.
- **Injected values** — always-present, non-CLI values or lazy factories
  (clocks, config, dependency injection).
- **Batched errors** — invalid input is collected across the whole parse and
  reported once, with machine-readable codes and a pluggable error handler.
- **Familiar parsing** — kebab-to-camel option names, short-flag clustering,
  repeated (array) options, `=` or spaced values, and `--` passthrough.
- **Built-in help & version** — auto-generated, width-aligned `--help` and
  `--version` screens built from your descriptions.

## Install

```sh
npm install kapitan
# or
pnpm add kapitan
```

kapitan is ESM-only and requires Node.js `^20.19.0 || >=22.12.0` (CommonJS
consumers on those versions can still `require('kapitan')`).

## Quick start

```ts
import { program } from 'kapitan';

program
  .version('1.0.0')
  .description('Greet someone.')
  .option('name', { required: true, description: 'Who to greet' })
  .option('loud', { type: 'boolean', alias: [{ name: 'l', short: true }] })
  .action(({ options }) => {
    const msg = `Hello, ${options.name}!`;
    console.log(options.loud ? msg.toUpperCase() : msg);
  });

program.start();
```

```console
$ my-cli --name Alice --loud
HELLO, ALICE!

$ my-cli
Missing required parameter '--name'      # → stderr, exit 1
```

`options` above is typed as `{ name: string; loud?: boolean }` — `name` is
non-optional because it is `required`, `loud` is optional because it has no
default. No annotations, no casts.

## The action payload

Every `.action()` receives a single object:

```ts
.action(({ command, options, args, rest }) => { /* … */ })
```

| Field     | Type                        | Meaning                                                        |
| --------- | --------------------------- | ------------------------------------------------------------- |
| `options` | typed from your `.option()` | Resolved flags, keyed by **camelCased** name (`--dry-run` → `dryRun`). |
| `args`    | typed from your `.argument()` | Positional arguments.                                        |
| `rest`    | `string[]`                  | Everything after a bare `--` (raw, unparsed). `[]` when absent. |
| `command` | `string \| undefined`       | The resolved command path (for nested commands).              |

## Options

```ts
program.option('port', {
  type: 'number',        // 'boolean' | 'string' | 'number' | 'date' | 'datetime'
                         //  | enum tuple | custom (value: string) => T
  default: 3000,
  required: false,
  array: false,          // true → repeatable, collected into an array
  description: 'Port to bind',
  alias: [{ name: 'p', short: true }, 'listen'], // → -p and --listen
  var: 'portNumber',     // store under a different key than the flag name
});
```

### Types & coercion

| `type`                    | Resolved as   | Notes                                              |
| ------------------------- | ------------- | -------------------------------------------------- |
| `'string'` (default)      | `string`      |                                                    |
| `'boolean'`               | `boolean`     | Bare `--loud` → `true`; `--loud=false` → `false`.  |
| `'number'`                | `number`      | Rejects non-numeric input.                         |
| `'date'`                  | `Date`        | Parsed with `dateFormat` (default `YYYY-MM-DD`).   |
| `'datetime'`              | `Date`        | Parsed with `dateTimeFormat` (`YYYY-MM-DD HH:mm:ss`). |
| `['dev','staging','prod']`| union member  | Enum — anything else is rejected with the choices. |
| `(v: string) => T`        | `T`           | Custom parser; throw to reject.                    |

### Date & datetime formats

`date` / `datetime` are parsed by [`fecha`](https://github.com/taylorhakes/fecha)
using its moment.js-style tokens. kapitan exposes a **numeric, non-localized
subset**, validated **at compile time** in `.config()`, so a miscased token is a
type error rather than a runtime surprise:

| Kind       | Tokens                                             | Default              |
| ---------- | -------------------------------------------------- | -------------------- |
| `date`     | `YYYY` `YY` `MM` `M` `DD` `D`                       | `YYYY-MM-DD`         |
| `datetime` | + `HH` `H` `hh` `h` `mm` `m` `ss` `s` `SSS`/`SS`/`S` `A`/`a` `ZZ`/`Z` | `YYYY-MM-DD HH:mm:ss` |

Separators: `-` `/` `:` `.` and space. fecha is strict — fixed-width tokens
reject `2026-7-3`, and out-of-range values (`2025-02-30`, hour `24`) are rejected
too. Localized **name** tokens (`MMM`/`MMMM` months, `ddd`/`dddd` days) are left
out of the subset on purpose; AM/PM (`A`/`a`) is kept.

```ts
program.config({ dateFormat: 'DD/MM/YYYY' });       // ✅
program.config({ dateFormat: 'yyyy-MM-dd' });       // ✗ compile error (that's the date-fns habit)
program.config({ dateFormat: 'YYYY-MM-DD HH:mm' }); // ✗ HH is a time token, not allowed in a date format
```

> The token vocabulary is validated lexically: it reliably catches unknown or
> miscased tokens, but a name token that decomposes into shorter ones (`MMM` seen
> as `MM`+`M`) is not rejected by the type — fecha still parses it at runtime.

#### The `'js'` escape hatch

Set `dateFormat` / `dateTimeFormat` to the sentinel `'js'` to bypass fecha and
delegate to the platform `new Date()` parser — i.e. ECMAScript's parser (the
ISO 8601 subset, plus engine-specific extras). Ideal for ingesting machine
timestamps such as `Date.prototype.toISOString()` output, which fecha's token
grammar doesn't cover:

```ts
program.config({ dateTimeFormat: 'js' })
  .option('since', { type: 'datetime' }); // --since 2026-07-03T13:45:00.000Z
```

Trade-off: `new Date()` is **laxer** than fecha (it accepts non-ISO, engine-dependent
inputs) and has the classic footgun — a date-only string is parsed as **UTC**,
a date-time string without an offset as **local**. Prefer explicit tokens unless
you specifically need to accept ISO/platform strings. Validity is still enforced:
an unparseable value yields `invalid-value`.

### Repeated (array) options

```ts
program.option('tag', { array: true }); //  --tag a --tag b  →  { tag: ['a', 'b'] }
```

A non-array option given twice is a `duplicate-option` error.

### Injected values

`inject` provides a non-CLI value (or lazy factory) that is always present on
`options` — handy for clocks, config, or DI:

```ts
program
  .inject('now', () => new Date())
  .action(({ options }) => console.log(options.now));
```

## Positional arguments

```ts
program
  .argument('source', { required: true })
  .argument('dest')                       // optional → string | undefined
  .action(({ args }) => copy(args.source, args.dest));
```

Array positionals (`{ array: true }`) collect the trailing tokens.

## Nested commands

`.command(name)` attaches a **leaf** command (has an `.action()`); `.sub(name)`
opens a **group** (holds more commands, no action of its own). Parent options and
hooks are inherited by every descendant.

```ts
program
  .option('verbose', { type: 'boolean' }) // inherited below
  .command('deploy')
  .description('Deploy to an environment')
  .option('env', { type: ['dev', 'staging', 'prod'], default: 'staging' })
  .action(({ options }) => {
    // options: { verbose?: boolean; env: 'dev' | 'staging' | 'prod' }
  });

program.start();
```

```console
$ my-cli deploy --env prod --verbose
```

## Hooks

A hook runs **before** the action with the resolved options. Group hooks run
ancestor→leaf, then the command's own hook, then the action:

```ts
program
  .hook((options) => { if (options.verbose) enableDebugLogging(); })
  .option('verbose', { type: 'boolean' })
  .action(() => run());
```

Async hooks are awaited by `startAsync()`; `start()` throws if one returns a
promise.

## Help & version

- `--help` / `-h` are **always** available and never error. They print a
  two-column, width-aligned help screen (usage, arguments, options, commands)
  built from your descriptions.
- `--version` / `-V` are enabled once you call `.version('…')`.
- Declaring your own `--help` / `--version` / `-h` / `-V` overrides the built-in.
- A group invoked with no sub-command prints its help automatically.

## Errors

Invalid input is collected across the whole parse pass and reported once; the
action never runs if any error was accumulated. By default each message is
written to `stderr` and the process exits `1`. Override with a handler that
receives the full batch:

```ts
import type { CliError } from 'kapitan'; // structured error record

program.config({
  errorHandler: (errors: CliError[]) => {
    for (const e of errors) log.error(e.code, e.token, e.message);
    process.exit(2);
  },
});
```

Each `CliError` carries a machine-readable `code` (`missing-required`,
`invalid-value`, `invalid-enum`, `unknown-command`, `too-many-arguments`, …),
the `token` as invoked, the offending `value`, and the expected `type` / `format`
— enough to format your own message.

## Parsing behavior

- **kebab → camel** — `--dry-run` is read as `options.dryRun`.
- **Short-flag clustering** — `-abc` expands to `-a -b -c`; a trailing value-taking
  flag consumes the rest (`-p8080`). `-5` stays a positional (negative number).
- **`=` and spaced values** — `--port=8080` and `--port 8080` are equivalent. A
  spaced value may start with `-` only if it looks like a negative number.
- **`--` passthrough** — everything after the first bare `--` lands in `rest`,
  untouched by option/command parsing.

## API surface

```ts
import { program } from 'kapitan';
import type { Program, Group, Command } from 'kapitan';
```

| Builder                    | Available on            | Purpose                                  |
| -------------------------- | ----------------------- | ---------------------------------------- |
| `.version(v)`              | program (root)          | Enable `--version`; one-shot, order-free.|
| `.description(text)`       | program / group / command | Header line in help; one-shot.         |
| `.config({ … })`           | program (root)          | `dateFormat`, `dateTimeFormat`, `errorHandler`. |
| `.option(name, opts?)`     | program / group / command | Declare a flag; grows the options type.|
| `.inject(name, value)`     | program / group / command | Always-present, non-CLI value.         |
| `.argument(name, opts?)`   | program / command       | Declare a positional.                    |
| `.hook(fn)`                | program / group / command | Run before the action.                 |
| `.sub(name)`               | program / group         | Open a nested group.                     |
| `.command(name)`           | program / group         | Attach a leaf command.                   |
| `.action(fn)`              | program / command       | Terminal handler.                        |
| `.start()` / `.startAsync()` | program (root)        | Parse `process.argv` and dispatch.       |

## AI assistants

An expanded, single-file reference for LLMs lives at
[`llms-full.txt`](./llms-full.txt), and a Claude Code skill ships at
[`SKILL.md`](./SKILL.md).

## License

MIT
