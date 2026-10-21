import { describe, expect, it, vi } from "vitest";
import { createHttpEditProvider } from "./edit-client";
import { createStructuredEditProposal } from "./structured-edit";
import { editProposalSchema, previewEditProposal } from "./edit-proposal";
import { sampleProject } from "../project-schema/project";
import { OPENROUTER_EDIT_MODEL } from "./edit-source";

const source = {
  provider: "openrouter",
  model: OPENROUTER_EDIT_MODEL,
} as const;
const sessionToken = "a".repeat(64);
const status = { mode: "live", ...source, sessionToken };
const operations = {
  version: 1,
  operations: [
    { op: "update", blockId: "hero-heading", changes: { text: "Welcome" } },
  ],
};
const input = {
  instruction: "Set the heading to Welcome",
  context: { name: sampleProject.name, blocks: sampleProject.blocks },
};
const signal = () => new AbortController().signal;

describe("explicit live edit client and proposal identity", () => {
  it("requires consent before even checking capability", async () => {
    const transport = vi.fn<typeof fetch>();
    await expect(
      createHttpEditProvider(transport, { mode: "live" }).propose(
        input,
        signal(),
      ),
    ).rejects.toMatchObject({ outcome: "validation_error" });
    expect(transport).not.toHaveBeenCalled();
  });
  it.each([
    { mode: "mock", provider: "synthetic", sessionToken },
    { ...status, model: "openrouter/free" },
    { ...status, provider: "other" },
    { ...status, sessionToken: "invalid" },
  ])(
    "does not POST when live capability is inconsistent (%#)",
    async (invalid) => {
      const transport = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(Response.json(invalid));
      await expect(
        createHttpEditProvider(transport, {
          mode: "live",
          consent: true,
        }).propose(input, signal()),
      ).rejects.toMatchObject({ outcome: "validation_error" });
      expect(transport).toHaveBeenCalledOnce();
    },
  );
  it.each([
    { mode: "mock", response: operations },
    {
      mode: "live",
      source: { ...source, model: "forged" },
      response: operations,
    },
    { mode: "live", source, response: { ...operations, projectId: "forged" } },
  ])(
    "rejects mode/source/metadata changes in the result (%#)",
    async (invalid) => {
      const transport = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(Response.json(status))
        .mockResolvedValueOnce(Response.json(invalid));
      await expect(
        createHttpEditProvider(transport, {
          mode: "live",
          consent: true,
        }).propose(input, signal()),
      ).rejects.toMatchObject({ outcome: "validation_error" });
      expect(transport).toHaveBeenCalledTimes(2);
    },
  );
  it("binds live source in host metadata without changing generation provenance", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(status))
      .mockResolvedValueOnce(
        Response.json({ mode: "live", source, response: operations }),
      );
    const project = structuredClone(sampleProject);
    const before = structuredClone(project);
    const proposal = await createStructuredEditProposal(
      project,
      input.instruction,
      createHttpEditProvider(transport, { mode: "live", consent: true }),
      signal(),
    );
    expect(proposal).toMatchObject({ mode: "live", source });
    expect(transport.mock.calls[1][1]?.headers).toMatchObject({
      "X-SiteForge-Edit-Mode": "live",
    });
    expect(
      editProposalSchema.safeParse({ ...proposal, mode: "mock" }).success,
    ).toBe(false);
    expect(
      editProposalSchema.safeParse({ ...proposal, source: undefined }).success,
    ).toBe(false);
    project.blocks[0].text = "Changed after proposal";
    expect(() => previewEditProposal(project, proposal)).toThrow(
      "Stale proposal baseline",
    );
    expect(before.blocks[0].text).toBe(sampleProject.blocks[0].text);
  });
});
