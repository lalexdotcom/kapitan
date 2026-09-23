import { expect, test } from "@rstest/core";
import { parseDate } from "../src/date.ts";

const ymd = (d: Date) => [d.getFullYear(), d.getMonth() + 1, d.getDate()];
const hms = (d: Date) => [d.getHours(), d.getMinutes(), d.getSeconds()];

// parseDate is a thin adapter over fecha; these characterize the token subset
// kapitan supports and the strictness we rely on.

test("parses the default date format", () => {
	const d = parseDate("2026-07-03", "YYYY-MM-DD");
	expect(d && ymd(d)).toEqual([2026, 7, 3]);
});

test("parses a custom day-first format", () => {
	const d = parseDate("03/07/2026", "DD/MM/YYYY");
	expect(d && ymd(d)).toEqual([2026, 7, 3]);
});

test("parses the default datetime format", () => {
	const d = parseDate("2026-07-03 13:45:30", "YYYY-MM-DD HH:mm:ss");
	expect(d && ymd(d)).toEqual([2026, 7, 3]);
	expect(d && hms(d)).toEqual([13, 45, 30]);
});

test("parses a 2-digit year as 2000-based", () => {
	const d = parseDate("26-07-03", "YY-MM-DD");
	expect(d && ymd(d)).toEqual([2026, 7, 3]);
});

test("parses AM/PM", () => {
	const d = parseDate("01:30 PM", "hh:mm A");
	expect(d && hms(d)).toEqual([13, 30, 0]);
});

test("rejects an overflowing day (Feb 30)", () => {
	expect(parseDate("2025-02-30", "YYYY-MM-DD")).toBeNull();
});

test("rejects out-of-range month, day, hour", () => {
	expect(parseDate("2025-13-01", "YYYY-MM-DD")).toBeNull();
	expect(parseDate("2025-00-01", "YYYY-MM-DD")).toBeNull();
	expect(parseDate("2025-01-00", "YYYY-MM-DD")).toBeNull();
	expect(parseDate("2025-01-01 24:00:00", "YYYY-MM-DD HH:mm:ss")).toBeNull();
});

test("is strict about token width (no single-digit padding for DD/MM)", () => {
	expect(parseDate("2026-7-3", "YYYY-MM-DD")).toBeNull();
});

test("rejects a non-numeric value", () => {
	expect(parseDate("not-a-date", "YYYY-MM-DD")).toBeNull();
});

test("matches literal separators verbatim", () => {
	expect(parseDate("2026.07.03", "YYYY.MM.DD")).not.toBeNull();
	expect(parseDate("2026-07-03", "YYYY.MM.DD")).toBeNull();
});

test("'js' delegates to the platform Date parser (ISO round-trip)", () => {
	const iso = "2026-07-03T13:45:30.000Z";
	const d = parseDate(iso, "js");
	expect(d?.toISOString()).toBe(iso);
});

test("'js' accepts a date-only ISO string", () => {
	expect(parseDate("2026-07-03", "js")).not.toBeNull();
});

test("'js' returns null on an unparseable value", () => {
	expect(parseDate("not-a-date", "js")).toBeNull();
});
