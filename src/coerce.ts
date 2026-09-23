// Validated value coercion for kapitan. Pure functions: on failure they push a
// CliError and return MISSING instead of producing NaN / Invalid Date.

import { parseDate } from "./date.ts";
import type { CliError } from "./errors.ts";
import type { OptionOptions, ProgramConfig } from "./types.ts";

/** Sentinel meaning "this option must not be assigned" (validation failed or absent). */
export const MISSING: unique symbol = Symbol("missing");

/**
 * Coerces one raw CLI string into the option's declared type, validating it.
 *
 * @param value - The raw string value (or undefined for a bare boolean flag).
 * @param option - The option configuration.
 * @param config - Program config (date formats).
 * @param display - Pre-formatted display token used verbatim in error messages (e.g. `-a`, `--foo`, or a positional name).
 * @param errors - Accumulator that receives a CliError on failure.
 * @returns The coerced value, or MISSING when validation failed.
 */
export function coerce(
	value: string | undefined,
	option: OptionOptions,
	config: ProgramConfig | undefined,
	display: string,
	errors: CliError[],
): unknown | typeof MISSING {
	const type = option.type;
	const raw = value ?? "";

	const single = (v: string): unknown | typeof MISSING => {
		if (typeof type === "function") {
			try {
				return type(v);
			} catch (e) {
				errors.push({
					code: "invalid-value",
					message: `Invalid value for '${display}': ${String(e instanceof Error ? e.message : e)}`,
					token: display,
					value: v,
				});
				return MISSING;
			}
		}
		if (type === "boolean") {
			return v === "true" || v.length === 0;
		}
		if (type === "number") {
			const n = Number.parseFloat(v);
			if (Number.isNaN(n)) {
				errors.push({
					code: "invalid-value",
					message: `Invalid number for '${display}': '${v}'`,
					token: display,
					value: v,
					type: "number",
				});
				return MISSING;
			}
			return n;
		}
		if (type === "date" || type === "datetime") {
			const fmt =
				type === "date"
					? (config?.dateFormat ?? "YYYY-MM-DD")
					: (config?.dateTimeFormat ?? "YYYY-MM-DD HH:mm:ss");
			const d = parseDate(v, fmt);
			if (d === null) {
				errors.push({
					code: "invalid-value",
					message: `Invalid date for '${display}': '${v}'`,
					token: display,
					value: v,
					type,
					format: fmt,
				});
				return MISSING;
			}
			return d;
		}
		if (Array.isArray(type)) {
			const allowed = type as readonly string[];
			if (!allowed.includes(v)) {
				errors.push({
					code: "invalid-enum",
					message: `Invalid value '${v}' for '${display}' (choices: ${allowed.join("|")})`,
					token: display,
					value: v,
					type,
				});
				return MISSING;
			}
			return v;
		}
		return `${v}`;
	};

	return single(raw);
}
