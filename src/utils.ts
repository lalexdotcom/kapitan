// String utility helpers for kapitan.

/**
 * Converts a kebab-case string to camelCase.
 *
 * @param snake - The kebab-case string to convert (e.g. `'output-dir'`).
 * @returns The camelCase equivalent (e.g. `'outputDir'`).
 */
export const camelize = (snake: string): string => {
	return snake
		.split("-")
		.map((s, i) => (i ? (s[0]?.toUpperCase() ?? "") + s.slice(1).toLowerCase() : s))
		.join("");
};
