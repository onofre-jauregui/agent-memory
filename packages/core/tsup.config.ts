import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "memory/index": "src/memory/index.ts",
    "guardrails/index": "src/guardrails/index.ts",
    "providers/index": "src/providers/index.ts",
  },
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "es2022",
  splitting: false,
});
