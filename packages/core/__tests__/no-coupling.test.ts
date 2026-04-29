/**
 * Enforces that no domain-specific tokens from the source private repo
 * leak into the public @agent-memory/core package. If this test fails,
 * sanitize the offending file before merging.
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SRC = join(__dirname, "..", "src");

const FORBIDDEN = [
  "kalshi",
  "polymarket",
  "weather",
  "omii",
  "pnl",
  "ticker",
  "strategy_id",
  "mid_price",
  "gfs",
  "kxhigh",
  "true_p",
  "nws",
  "resolution",
  "side",
  "price",
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const s = statSync(full);
    if (s.isDirectory()) out.push(...walk(full));
    else if ([".ts", ".tsx", ".js", ".mjs"].includes(extname(name))) out.push(full);
  }
  return out;
}

describe("no domain coupling in @agent-memory/core src", () => {
  const files = walk(SRC);

  for (const file of files) {
    it(`${file.replace(SRC, "")} contains no forbidden tokens`, () => {
      const text = readFileSync(file, "utf8").toLowerCase();
      const hits: string[] = [];
      for (const tok of FORBIDDEN) {
        // Whole-word/identifier match: token must not appear as a contiguous
        // alphanumeric/underscore run inside a larger identifier. We match it
        // when bounded by start/end or a non-word character.
        const re = new RegExp(`(^|[^a-z0-9_])${tok}([^a-z0-9_]|$)`);
        if (re.test(text)) hits.push(tok);
      }
      expect(hits, `forbidden tokens in ${file}: ${hits.join(", ")}`).toEqual([]);
    });
  }
});
