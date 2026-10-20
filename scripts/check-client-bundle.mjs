import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
const files = [];
function walk(path) {
  for (const item of readdirSync(path, { withFileTypes: true })) {
    const file = join(path, item.name);
    if (item.isDirectory()) walk(file);
    else if (/\.(?:js|css|html|map)$/.test(file)) files.push(file);
  }
}
walk("dist");
if (!files.length) throw new Error("Build output missing");
const forbidden = [
  /sk-[A-Za-z0-9_-]{20,}/,
  /AIza[A-Za-z0-9_-]{30,}/,
  /-----BEGIN .*PRIVATE KEY-----/,
  /SITEFORGE_GEMINI_API_KEY/,
  /SITEFORGE_OPENROUTER_API_KEY/,
  /openrouter\.ai\/api\/v1/,
  /generativelanguage\.googleapis\.com/,
  /x-goog-api-key/,
];
const sentinel = process.env.SITEFORGE_BUILD_SENTINEL;
const hits = files.filter((file) => {
  const text = readFileSync(file, "utf8");
  return (
    forbidden.some((pattern) => pattern.test(text)) ||
    (sentinel && text.includes(sentinel))
  );
});
if (hits.length) {
  console.error("Client bundle security check failed in:", hits.join(", "));
  process.exitCode = 1;
} else
  console.log(
    "PASS: client artifacts contain no checked credential patterns, backend key variables, Gemini/OpenRouter endpoints, or injected sentinel.",
  );
