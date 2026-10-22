import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { compileWebsitePlan } from "../src/ai/website-plan";
import { designPresets } from "../src/project-schema/design";
import { ProjectRenderer } from "../src/renderer/ProjectRenderer";

// Reproducible visual fixtures. No provider calls, environment or browser storage access.
const assets = resolve("dist/assets");
const cssName = readdirSync(assets).find((name) =>
  /^index-.*\.css$/.test(name),
);
if (!cssName)
  throw new Error("Build the application before rendering previews.");
const css = readFileSync(resolve(assets, cssName), "utf8");
const directory = resolve("docs/design-previews");
mkdirSync(directory, { recursive: true });
const block = (type: string, text: string, extra = {}) => ({
  type,
  text,
  body: "",
  action: "",
  target: "",
  style: "",
  items: [],
  email: "",
  phone: "",
  address: "",
  ...extra,
});
const input = {
  name: "Arunika Studio",
  prompt:
    "Demo studio kreatif dalam Bahasa Indonesia: perancangan identitas, pengalaman digital, dan arah kreatif. Ide berani. Desain yang berarti. Kontak halo@example.test. Semua materi sintetis untuk pengujian visual, bukan fakta usaha nyata.",
};
for (const preset of designPresets) {
  const project = compileWebsitePlan(
    JSON.stringify({
      design: preset.id,
      blocks: [
        block("hero", "Ide berani. Desain yang berarti.", {
          body: "Dari arah kreatif hingga pengalaman digital, temukan ruang untuk mewujudkan ide Anda.",
          action: "Mulai kolaborasi",
          target: "2",
        }),
        block("features", "Satu ide, berbagai kemungkinan.", {
          style: "grid",
          items: [
            {
              title: "Identitas",
              description:
                "Wujudkan karakter ide Anda melalui desain yang konsisten.",
            },
            {
              title: "Digital",
              description: "Susun pengalaman yang jelas dan mudah digunakan.",
            },
            {
              title: "Arah kreatif",
              description: "Hubungkan cerita, visual, dan tujuan Anda.",
            },
          ],
        }),
        block("contact", "Mari mulai dari sebuah percakapan.", {
          body: "Ceritakan ide Anda dan arah yang ingin dijelajahi.",
          email: "halo@example.test",
        }),
      ],
    }),
    input,
    { id: "mock", model: "synthetic-design-fixture" },
    `demo-${preset.id}`,
  );
  const rendered = renderToStaticMarkup(<ProjectRenderer project={project} />);
  const html = `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${preset.label} — synthetic design preview</title><style>${css}</style><style>body{margin:0;background:#e9edf2}.design-demo-note{padding:14px 24px;background:white;color:#374151;font:13px system-ui;border-bottom:1px solid #d7dee8}.design-demo-note strong{margin-right:16px}.design-demo-document{max-width:1280px;margin:auto}</style></head><body><header class="design-demo-note"><strong>${preset.label}</strong>Konten sintetis · Bukan hasil AI live · Tidak disimpan sebagai proyek</header><main class="design-demo-document">${rendered}</main></body></html>`;
  writeFileSync(resolve(directory, `${preset.id}.html`), html, "utf8");
}
console.log(
  "Rendered four synthetic design previews in docs/design-previews/.",
);
