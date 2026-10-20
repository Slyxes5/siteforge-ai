import type { Project } from "../project-schema/project";
import { createEditProposal, type EditProposal } from "./edit-proposal";

const usage =
  "Commands: update <block-id> <field> <JSON value>; add <block-type> after <block-id|start> <JSON properties excluding id/type>; remove <block-id>; reorder <comma-separated IDs>. Put each command on a separate line.";
function jsonValue(source: string, line: number): unknown {
  try {
    return JSON.parse(source);
  } catch {
    throw new Error(
      `Command line ${line}: invalid JSON; quote text values with double quotes.`,
    );
  }
}
/**
 * Synchronous, offline command parser; never guesses natural-language intent.
 * update (or ubah) <block-id> <field> <JSON value>
 * add <block-type> after <block-id|start> <JSON properties excluding id/type>
 * remove <block-id>
 * reorder <comma-separated IDs>
 * Newline-separated commands form one atomic proposal. JSON must fit on one line.
 */
export function createMockEditProposal(
  base: Project,
  request: string,
): EditProposal {
  if (typeof request !== "string" || !request.trim() || request.length > 10000)
    throw new Error(`Request must contain 1–10000 characters. ${usage}`);
  const lines = request
    .split(/\r?\n/)
    .map((line, index) => ({ text: line.trim(), number: index + 1 }))
    .filter((line) => line.text);
  if (lines.length > 100)
    throw new Error("Request supports at most 100 commands.");
  const used = new Set(base.blocks.map((block) => block.id));
  const operations: unknown[] = lines.map(({ text, number }) => {
    let match = /^(?:update|ubah)\s+(\S+)\s+(\S+)\s+(.+)$/.exec(text);
    if (match)
      return {
        op: "update",
        blockId: match[1],
        changes: { [match[2]]: jsonValue(match[3], number) },
      };
    match = /^add\s+(\S+)\s+after\s+(\S+)\s+(.+)$/.exec(text);
    if (match) {
      const properties = jsonValue(match[3], number);
      if (
        !properties ||
        typeof properties !== "object" ||
        Array.isArray(properties) ||
        ["id", "type"].some((key) => Object.hasOwn(properties, key))
      )
        throw new Error(
          `Command line ${number}: add requires a JSON object excluding id and type.`,
        );
      let id = crypto.randomUUID();
      while (used.has(id)) id = crypto.randomUUID();
      used.add(id);
      return {
        op: "add",
        block: { ...properties, id, type: match[1] },
        afterId: match[2] === "start" ? null : match[2],
      };
    }
    match = /^remove\s+(\S+)$/.exec(text);
    if (match) return { op: "remove", blockId: match[1] };
    match = /^reorder\s+(.+)$/.exec(text);
    if (match)
      return {
        op: "reorder",
        blockIds: match[1].split(",").map((id) => id.trim()),
      };
    throw new Error(`Command line ${number} is unsupported. ${usage}`);
  });
  return createEditProposal(base, request, operations);
}
