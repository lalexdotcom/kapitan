# kapitan

> Same command line. Fully typed. Higher rank — meet kapitan.

A small, **type-first** CLI framework for Node.js — commander.js-like ergonomics,
but every option, argument and injected value flows through the type system, so
your action handler receives a fully-typed, fully-resolved payload with zero
casts.

## Features

- **Source-pure** — no build step: ships as TypeScript and runs under any
  runtime that strips types.
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
