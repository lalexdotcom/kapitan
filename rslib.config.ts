import { defineConfig } from "@rslib/core";

export default defineConfig({
	lib: [
		{
			format: "esm",
			syntax: "es2023",
			dts: true,
		},
	],
	source: {
		entry: {
			index: "./src/index.ts",
		},
		tsconfigPath: "./tsconfig.build.json",
	},
	output: {
		target: "node",
		cleanDistPath: true,
	},
});
