import { writeFileSync } from "node:fs";
import { buildGeminiRequestBody } from "../server/gemini-request-contract";
import { buildWebsitePlanRequestBody } from "../server/website-plan-request";
import { coffeeAcceptance } from "./coffee-acceptance-scenario";

function measure(encoded: string) {
  const body = JSON.parse(encoded);
  const schema = body.generationConfig.responseJsonSchema;
  let schemaNodes = 0,
    schemaDepth = 0,
    unionBranches = 0,
    requiredFields = 0,
    descriptions = 0;
  const visit = (node: any, depth: number) => {
    schemaNodes++;
    schemaDepth = Math.max(schemaDepth, depth);
    requiredFields += node.required?.length ?? 0;
    descriptions += typeof node.description === "string" ? 1 : 0;
    for (const child of Object.values(node.properties ?? {}))
      visit(child, depth + 1);
    if (node.items) visit(node.items, depth + 1);
    for (const child of [...(node.anyOf ?? []), ...(node.oneOf ?? [])]) {
      unionBranches++;
      visit(child, depth + 1);
    }
  };
  visit(schema, 1);
  return {
    requestBytes: Buffer.byteLength(encoded),
    schemaBytes: Buffer.byteLength(JSON.stringify(schema)),
    instructionBytes: Buffer.byteLength(body.systemInstruction.parts[0].text),
    schemaNodes,
    schemaDepth,
    unionBranches,
    requiredFields,
    descriptions,
    maxOutputTokens: body.generationConfig.maxOutputTokens,
  };
}
const request = {
  name: coffeeAcceptance.name,
  prompt: coffeeAcceptance.prompt,
};
const legacy = measure(buildGeminiRequestBody(request));
const plan = measure(buildWebsitePlanRequestBody(request));
if (
  plan.schemaBytes >= legacy.schemaBytes ||
  plan.requestBytes >= legacy.requestBytes ||
  plan.unionBranches !== 0 ||
  plan.schemaNodes >= legacy.schemaNodes
)
  throw new Error("Contract was not simplified");
const report = {
  scenario: coffeeAcceptance.id,
  units:
    "UTF-8 bytes; schema-node depth counts schema nodes, not JSON containers",
  legacy,
  websitePlan: plan,
  reductionsPercent: Object.fromEntries(
    ["requestBytes", "schemaBytes", "schemaNodes", "requiredFields"].map(
      (key) => [
        key,
        Number(
          (
            (1 -
              plan[key as keyof typeof plan] /
                legacy[key as keyof typeof legacy]) *
            100
          ).toFixed(2),
        ),
      ],
    ),
  ),
  note: "Offline measurement only. No token estimate or claim of Gemini acceptance. Uniform blocks may increase output size for short blocks; maxOutputTokens is unchanged.",
};
writeFileSync(
  "docs/website-plan-complexity.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
