import { describe, expect, it } from "vitest";
import { sampleProject } from "../project-schema/project";
import { previewEditProposal } from "./edit-proposal";
import { createMockEditProposal } from "./mock-chat-editor";

describe("mock chat editor", () => {
  it("supports atomic multiline add/remove/reorder commands with host UUIDs", () => {
    const proposal = createMockEditProposal(
      sampleProject,
      'add paragraph after start {"text":"Welcome"}\nubah hero-heading text "Fresh"\nremove hero-copy',
    );
    const added = proposal.operations[0];
    expect(added.op).toBe("add");
    if (added.op !== "add") throw new Error("Expected add");
    expect(added.block.id).toMatch(
      /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i,
    );
    expect(added.afterId).toBeNull();
    expect(
      previewEditProposal(sampleProject, proposal).blocks.map(
        (block) => block.text,
      ),
    ).toEqual(["Welcome", "Fresh"]);
    const after = createMockEditProposal(
      sampleProject,
      'add heading after hero-heading {"text":"Middle"}',
    );
    expect(previewEditProposal(sampleProject, after).blocks[1].text).toBe(
      "Middle",
    );
    const reordered = createMockEditProposal(
      sampleProject,
      "reorder hero-copy, hero-heading",
    );
    expect(
      previewEditProposal(sampleProject, reordered).blocks.map(
        (block) => block.id,
      ),
    ).toEqual(["hero-copy", "hero-heading"]);
  });
  it.each([
    "",
    "make it nicer",
    "update hero-heading text Hello",
    'add heading after start {"id":"owned","text":"Hi"}',
    'add heading after start {"type":"paragraph","text":"Hi"}',
    'update hero-heading id "changed"',
    "remove unknown",
    "reorder hero-heading",
    'update hero-heading text "Hi"\nremove unknown',
  ])("rejects invalid commands actionably without mutation: %s", (request) => {
    const before = structuredClone(sampleProject);
    expect(() => createMockEditProposal(sampleProject, request)).toThrow(
      /command|JSON|field|target|permutation|request/i,
    );
    expect(sampleProject).toEqual(before);
  });
  it("parses explicit update commands synchronously without network", () => {
    const before = structuredClone(sampleProject);
    const proposal = createMockEditProposal(
      sampleProject,
      'update hero-heading text "Hello world"',
    );
    expect(proposal).not.toBeInstanceOf(Promise);
    expect(proposal.mode).toBe("mock");
    expect(proposal.operations).toEqual([
      {
        op: "update",
        blockId: "hero-heading",
        changes: { text: "Hello world" },
      },
    ]);
    expect(previewEditProposal(sampleProject, proposal).blocks[0].text).toBe(
      "Hello world",
    );
    expect(sampleProject).toEqual(before);
  });
});
