// Date / datetime parsing for kapitan's `date` and `datetime` option types.
//
// Delegates to fecha (https://github.com/taylorhakes/fecha) — a ~2 KB, mature,
// moment.js-style token parser. fecha.parse is already strict: it returns null
// on unparseable input, out-of-range fields (month 13, day 32, hour 24),
// overflow (2025-02-30) and width mismatches (2026-7-3 against MM/DD). kapitan
// exposes a numeric, non-localized subset of fecha's tokens (see DateToken /
// DateTimeToken in types.ts) — month/day *names* are intentionally out of scope.
//
// The reserved format `JS_FORMAT` ('js') is an escape hatch: instead of a token
// format it delegates to the platform `new Date()` parser (ECMAScript, i.e. the
// ISO 8601 subset + engine-specific extras). Handy for machine timestamps such
// as `Date.prototype.toISOString()` output — beyond fecha's token grammar.

import { parse } from "fecha";

/** Sentinel `dateFormat`/`dateTimeFormat` value selecting the platform Date parser. */
export const JS_FORMAT = "js";

/**
 * Parses a date/datetime string against a fecha token format, or via the
 * platform `new Date()` parser when `format` is the {@link JS_FORMAT} sentinel.
 *
 * @param value - The raw input string.
 * @param format - A fecha token format, or `'js'` to delegate to `new Date()`.
 * @returns The parsed Date, or `null` when the input does not match or is out of range.
 */
export function parseDate(value: string, format: string) {
	if (format === JS_FORMAT) {
		const date = new Date(value);
		return Number.isNaN(date.getTime()) ? null : date;
	}
	return parse(value, format);
}
