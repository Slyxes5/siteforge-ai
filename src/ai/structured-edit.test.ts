import { afterEach, describe, expect, it, vi } from "vitest";
import { sampleProject, type Project } from "../project-schema/project";
import { previewEditProposal, projectSnapshot } from "./edit-proposal";
import {
  createStructuredEditProposal,
  createSyntheticEditProvider,
  type EditProviderRequest,
} from "./structured-edit";

const base = (): Project => structuredClone(sampleProject);
const provider = (raw: string) => ({
  id: "fixture",
  propose: vi.fn(async (_request: unknown, _signal: AbortSignal) => raw),
});
const operations = (ops: unknown[]) =>
  JSON.stringify({ version: 1, operations: ops });

describe("structured editing boundary", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each([
    "id",
    "projectId",
    "revision",
    "baseRevision",
    "baseSnapshot",
    "mode",
    "request",
    "summary",
    "schemaVersion",
    "generation",
    "extra",
  ])("rejects provider-controlled envelope metadata: %s", async (key) => {
    const source = provider(
      JSON.stringify({
        version: 1,
        operations: [{ op: "remove", blockId: "hero-copy" }],
        [key]: "provider-controlled",
      }),
    );
    const project = base();
    const before = projectSnapshot(project);
    await expect(
      createStructuredEditProposal(
        project,
        "Rewrite",
        source,
        new AbortController().signal,
      ),
    ).rejects.toThrow(/structured edit response/i);
    expect(source.propose).toHaveBeenCalledOnce();
    expect(projectSnapshot(project)).toBe(before);
  });

  it.each([
    [
      "missing version",
      { operations: [{ op: "remove", blockId: "hero-copy" }] },
    ],
    [
      "unknown version",
      { version: 2, operations: [{ op: "remove", blockId: "hero-copy" }] },
    ],
    ["no operations", { version: 1, operations: [] }],
    [
      "too many operations",
      {
        version: 1,
        operations: Array(101).fill({ op: "remove", blockId: "hero-copy" }),
      },
    ],
  ])("rejects invalid response envelopes: %s", async (_name, value) => {
    await expect(
      createStructuredEditProposal(
        base(),
        "Rewrite",
        provider(JSON.stringify(value)),
        new AbortController().signal,
      ),
    ).rejects.toThrow(/structured edit response/i);
  });

  it.each([
    { op: "apply", blockId: "hero-heading" },
    { op: "save" },
    { op: "update", blockId: "hero-heading", changes: { id: "owned" } },
    { op: "update", blockId: "hero-heading", changes: { type: "paragraph" } },
    { op: "update", blockId: "hero-heading", changes: { revision: 99 } },
    {
      op: "update",
      blockId: "hero-heading",
      changes: { text: "Welcome" },
      extra: true,
    },
    { op: "update", blockId: "hero-heading", changes: {} },
    {
      op: "add",
      afterId: null,
      block: { id: "owned", type: "heading", text: "Welcome" },
    },
    {
      op: "add",
      afterId: null,
      block: { type: "heading", text: "Welcome", extra: true },
    },
    { op: "add", afterId: null, block: { type: "script", text: "Welcome" } },
    { op: "remove", blockId: "" },
    { op: "remove", blockId: "x".repeat(201) },
    { op: "reorder", blockIds: Array(201).fill("hero-copy") },
    JSON.parse(
      '{"op":"update","blockId":"hero-heading","changes":{"__proto__":{"polluted":true}}}',
    ),
  ])("rejects disallowed or malformed operations: %j", async (operation) => {
    await expect(
      createStructuredEditProposal(
        base(),
        "Rewrite",
        provider(operations([operation])),
        new AbortController().signal,
      ),
    ).rejects.toThrow();
    expect(Object.prototype).not.toHaveProperty("polluted");
  });

  it.each(["", "{", "```json\n{}\n```", "null", "[]", '"text"', "42"])(
    "rejects malformed JSON or non-object output: %j",
    async (raw) => {
      const source = provider(raw);
      await expect(
        createStructuredEditProposal(
          base(),
          "Rewrite",
          source,
          new AbortController().signal,
        ),
      ).rejects.toThrow(/JSON|structured edit response/i);
      expect(source.propose).toHaveBeenCalledOnce();
    },
  );

  it.each(["x".repeat(131_073), "界".repeat(45_000)])(
    "bounds raw response UTF-8 bytes before parsing",
    async (raw) => {
      await expect(
        createStructuredEditProposal(
          base(),
          "Rewrite",
          provider(raw),
          new AbortController().signal,
        ),
      ).rejects.toThrow(/response size/i);
    },
  );

  it("rejects non-string transport output at runtime", async () => {
    const fixture = createSyntheticEditProvider(
      async () => ({ operations: [] }) as unknown as string,
    );
    await expect(
      createStructuredEditProposal(
        base(),
        "Rewrite",
        fixture,
        new AbortController().signal,
      ),
    ).rejects.toThrow(/response size/i);
  });

  it.each(["", "   ", "x".repeat(10_001)])(
    "rejects invalid instructions without invoking transport",
    async (instruction) => {
      const source = provider("{}");
      await expect(
        createStructuredEditProposal(
          base(),
          instruction,
          source,
          new AbortController().signal,
        ),
      ).rejects.toThrow(/instruction/i);
      expect(source.propose).not.toHaveBeenCalled();
    },
  );

  it("rejects invalid projects and oversized UTF-8 context before transport", async () => {
    const source = provider("{}");
    await expect(
      createStructuredEditProposal(
        { ...base(), revision: -1 },
        "Rewrite",
        source,
        new AbortController().signal,
      ),
    ).rejects.toThrow();
    const project: Project = {
      ...base(),
      blocks: Array.from({ length: 5 }, (_, index) => ({
        id: `block-${index}`,
        type: "paragraph",
        text: "界".repeat(10_000),
      })),
    };
    await expect(
      createStructuredEditProposal(
        project,
        "Rewrite",
        source,
        new AbortController().signal,
      ),
    ).rejects.toThrow(/context.*large/i);
    expect(source.propose).not.toHaveBeenCalled();
  });

  it.each([
    { op: "update", blockId: "hero-heading", changes: { text: 42 } },
    { op: "update", blockId: "hero-heading", changes: { text: "" } },
    {
      op: "update",
      blockId: "hero-heading",
      changes: { text: "x".repeat(10_001) },
    },
    { op: "update", blockId: "hero-heading", changes: { tone: "dark" } },
    { op: "remove", blockId: "unknown" },
    {
      op: "add",
      afterId: "unknown",
      block: { type: "paragraph", text: "Welcome" },
    },
    { op: "reorder", blockIds: ["hero-heading", "hero-heading"] },
    { op: "reorder", blockIds: ["hero-heading"] },
    { op: "reorder", blockIds: ["hero-heading", "unknown"] },
    {
      op: "add",
      afterId: null,
      block: { type: "button", text: "Open", href: "javascript:alert(1)" },
    },
    {
      op: "add",
      afterId: null,
      block: { type: "button", text: "Open", href: "#hero-heading" },
    },
    {
      op: "add",
      afterId: null,
      block: {
        type: "image",
        text: "",
        alt: "Photo",
        src: "https://invented.example/photo.png",
      },
    },
    { op: "update", blockId: "hero-heading", changes: { text: "999 clients" } },
    {
      op: "update",
      blockId: "hero-heading",
      changes: { text: "fake@example.com" },
    },
  ])(
    "reuses canonical validation atomically after an earlier valid operation: %j",
    async (operation) => {
      const project = base();
      const before = projectSnapshot(project);
      const source = provider(
        operations([
          { op: "update", blockId: "hero-copy", changes: { text: "Welcome" } },
          operation,
        ]),
      );
      await expect(
        createStructuredEditProposal(
          project,
          "Rewrite",
          source,
          new AbortController().signal,
        ),
      ).rejects.toThrow();
      expect(projectSnapshot(project)).toBe(before);
    },
  );

  it("does not allow transport context mutation to launder numeric facts", async () => {
    const fixture = createSyntheticEditProvider(async (request) => {
      request.context.blocks[0].text = "999 clients";
      return operations([
        {
          op: "update",
          blockId: "hero-heading",
          changes: { text: "999 clients" },
        },
      ]);
    });
    await expect(
      createStructuredEditProposal(
        base(),
        "Rewrite",
        fixture,
        new AbortController().signal,
      ),
    ).rejects.toThrow(/UNSUPPORTED_BUSINESS_FACT/);
  });

  it("supports update, reorder, remove and multiple host-ID additions sequentially", async () => {
    const source = provider(
      operations([
        { op: "update", blockId: "hero-heading", changes: { text: "Welcome" } },
        { op: "reorder", blockIds: ["hero-copy", "hero-heading"] },
        { op: "remove", blockId: "hero-copy" },
        {
          op: "add",
          afterId: null,
          block: { type: "paragraph", text: "First" },
        },
        {
          op: "add",
          afterId: "hero-heading",
          block: { type: "paragraph", text: "Last" },
        },
      ]),
    );
    const proposal = await createStructuredEditProposal(
      base(),
      "Welcome",
      source,
      new AbortController().signal,
    );
    const preview = previewEditProposal(base(), proposal);
    expect(preview.blocks.map((block) => block.text)).toEqual([
      "First",
      "Welcome",
      "Last",
    ]);
    expect(new Set(preview.blocks.map((block) => block.id)).size).toBe(3);
    expect(preview.blocks[1]).toMatchObject({
      id: "hero-heading",
      type: "heading",
    });
    expect(preview.revision).toBe(0);
  });

  it("retries only local ID collisions, never the transport", async () => {
    const project = base();
    const existingId = "00000000-0000-4000-8000-000000000001";
    const newId = "00000000-0000-4000-8000-000000000002";
    const proposalId = "00000000-0000-4000-8000-000000000003";
    project.blocks[0].id = existingId;
    vi.spyOn(crypto, "randomUUID")
      .mockReturnValueOnce(existingId)
      .mockReturnValueOnce(newId)
      .mockReturnValueOnce(proposalId);
    const source = provider(
      operations([
        {
          op: "add",
          afterId: null,
          block: { type: "paragraph", text: "Welcome" },
        },
      ]),
    );
    const proposal = await createStructuredEditProposal(
      project,
      "Welcome",
      source,
      new AbortController().signal,
    );
    expect(proposal.id).toBe(proposalId);
    expect(proposal.operations[0]).toMatchObject({ block: { id: newId } });
    expect(source.propose).toHaveBeenCalledOnce();
  });

  it("preserves host metadata and storage without networking or automatic application", async () => {
    const project: Project = {
      ...base(),
      id: "private-project",
      revision: 7,
      description: "Host description",
      generation: {
        kind: "template",
        templateId: "host-template",
        templateVersion: 1,
      },
    };
    const before = structuredClone(project);
    const stored = JSON.stringify(before);
    localStorage.setItem("siteforge:phase2a-isolation", stored);
    const save = vi.spyOn(Storage.prototype, "setItem");
    const fetch = vi.fn(() => {
      throw new Error("Network forbidden");
    });
    vi.stubGlobal("fetch", fetch);
    const source = provider(
      operations([
        { op: "update", blockId: "hero-heading", changes: { text: "Welcome" } },
      ]),
    );
    const proposal = await createStructuredEditProposal(
      project,
      "Welcome",
      source,
      new AbortController().signal,
    );
    const request = source.propose.mock.calls[0][0] as EditProviderRequest;
    expect(Object.keys(request).sort()).toEqual(["context", "instruction"]);
    expect(Object.keys(request.context).sort()).toEqual([
      "blocks",
      "description",
      "name",
    ]);
    expect(JSON.stringify(request)).not.toContain("private-project");
    const preview = previewEditProposal(project, proposal);
    expect({ ...preview, blocks: [] }).toEqual({ ...before, blocks: [] });
    expect(project).toEqual(before);
    expect(localStorage.getItem("siteforge:phase2a-isolation")).toBe(stored);
    expect(save).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    localStorage.removeItem("siteforge:phase2a-isolation");
  });

  it("binds an asynchronous proposal to the starting snapshot, not later unsaved edits", async () => {
    const project = base();
    const original = base();
    let finish!: (raw: string) => void;
    const fixture = createSyntheticEditProvider(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    );
    const pending = createStructuredEditProposal(
      project,
      "Welcome",
      fixture,
      new AbortController().signal,
    );
    project.blocks[1].text = "Unsaved change while waiting";
    finish(
      operations([
        { op: "update", blockId: "hero-heading", changes: { text: "Welcome" } },
      ]),
    );
    const proposal = await pending;
    expect(proposal.baseSnapshot).toBe(projectSnapshot(original));
    expect(() => previewEditProposal(project, proposal)).toThrow(
      /stale|baseline/i,
    );
    expect(() =>
      previewEditProposal({ ...original, id: "other-project" }, proposal),
    ).toThrow(/stale|baseline/i);
    expect(() =>
      previewEditProposal({ ...original, revision: 1 }, proposal),
    ).toThrow(/stale|baseline/i);
    expect(project.blocks[1].text).toBe("Unsaved change while waiting");
  });

  it("does not call transport for an already aborted signal", async () => {
    const controller = new AbortController();
    controller.abort();
    const source = provider("{}");
    await expect(
      createStructuredEditProposal(
        base(),
        "Rewrite",
        source,
        controller.signal,
      ),
    ).rejects.toMatchObject({ outcome: "cancelled" });
    expect(source.propose).not.toHaveBeenCalled();
  });

  it("cancels an uncooperative transport and ignores its late response", async () => {
    const controller = new AbortController();
    let finish!: (raw: string) => void;
    let transportSignal!: AbortSignal;
    const transport = vi.fn(
      (_request: EditProviderRequest, signal: AbortSignal) => {
        transportSignal = signal;
        return new Promise<string>((resolve) => {
          finish = resolve;
        });
      },
    );
    const project = base();
    const before = projectSnapshot(project);
    const pending = createStructuredEditProposal(
      project,
      "Rewrite",
      createSyntheticEditProvider(transport),
      controller.signal,
    );
    const rejected = expect(pending).rejects.toMatchObject({
      outcome: "cancelled",
    });
    controller.abort();
    await rejected;
    expect(transportSignal.aborted).toBe(true);
    finish(operations([{ op: "remove", blockId: "hero-copy" }]));
    await Promise.resolve();
    expect(projectSnapshot(project)).toBe(before);
    expect(transport).toHaveBeenCalledOnce();
  });

  it("rejects a synchronous transport that returns after its deadline before the timer can fire", async () => {
    vi.useFakeTimers();
    let clock = 0;
    vi.spyOn(performance, "now").mockImplementation(() => clock);
    const transport = vi.fn(async () => {
      clock = 6;
      return operations([{ op: "remove", blockId: "hero-copy" }]);
    });
    await expect(
      createStructuredEditProposal(
        base(),
        "Rewrite",
        createSyntheticEditProvider(transport),
        new AbortController().signal,
        5,
      ),
    ).rejects.toMatchObject({ outcome: "timeout" });
    expect(transport).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    [0, 1],
    [-1, 1],
    [5, 5],
    [100_000, 45_000],
    [NaN, 45_000],
    [Infinity, 45_000],
  ])(
    "bounds non-cooperative transport deadline %s to %s milliseconds",
    async (requested, bounded) => {
      vi.useFakeTimers();
      let transportSignal!: AbortSignal;
      const transport = vi.fn(
        (_request: EditProviderRequest, signal: AbortSignal) => {
          transportSignal = signal;
          return new Promise<string>(() => {});
        },
      );
      const controller = new AbortController();
      const remove = vi.spyOn(controller.signal, "removeEventListener");
      const pending = createStructuredEditProposal(
        base(),
        "Rewrite",
        createSyntheticEditProvider(transport),
        controller.signal,
        requested,
      );
      const rejected = expect(pending).rejects.toMatchObject({
        outcome: "timeout",
      });
      await vi.advanceTimersByTimeAsync(bounded - 1);
      expect(transportSignal.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await rejected;
      expect(transportSignal.aborted).toBe(true);
      expect(transport).toHaveBeenCalledOnce();
      expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it.each(["success", "malformed", "throw", "reject"])(
    "cleans deadlines and caller listeners on %s without retry or fallback",
    async (kind) => {
      vi.useFakeTimers();
      const controller = new AbortController();
      const add = vi.spyOn(controller.signal, "addEventListener");
      const remove = vi.spyOn(controller.signal, "removeEventListener");
      const transport = vi.fn(() => {
        if (kind === "throw") throw new Error("Synthetic sync failure");
        if (kind === "reject")
          return Promise.reject(new Error("Synthetic rejection"));
        return Promise.resolve(
          kind === "success"
            ? operations([{ op: "remove", blockId: "hero-copy" }])
            : "{",
        );
      });
      const pending = createStructuredEditProposal(
        base(),
        "Rewrite",
        createSyntheticEditProvider(transport),
        controller.signal,
      );
      if (kind === "success")
        await expect(pending).resolves.toMatchObject({ projectId: base().id });
      else await expect(pending).rejects.toThrow();
      expect(transport).toHaveBeenCalledOnce();
      expect(remove).toHaveBeenCalledWith("abort", add.mock.calls[0][1]);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it.each([
    { type: "heading", text: "Welcome" },
    { type: "paragraph", text: "Welcome" },
    { type: "button", text: "Open", href: "#" },
    { type: "image", text: "", alt: "Photo", src: "/photo.svg" },
    { type: "hero", text: "Welcome", subtitle: "", ctaText: "", ctaHref: "" },
    { type: "section", text: "Welcome", body: "", tone: "light" },
    {
      type: "features",
      text: "Services",
      layout: "grid",
      items: [{ title: "Design", description: "" }],
    },
    {
      type: "contact",
      text: "Contact",
      body: "",
      email: "",
      phone: "",
      address: "",
    },
  ])(
    "accepts canonical $type additions with application-generated IDs",
    async (block) => {
      const source = provider(
        operations([{ op: "add", afterId: null, block }]),
      );
      const proposal = await createStructuredEditProposal(
        base(),
        'Add block with image source "/photo.svg"',
        source,
        new AbortController().signal,
      );
      const added = previewEditProposal(base(), proposal).blocks[0];
      expect(added).toMatchObject(block);
      expect(added.id).toMatch(
        /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i,
      );
      expect(base().blocks.some((existing) => existing.id === added.id)).toBe(
        false,
      );
    },
  );

  it("isolates simultaneous projects even when responses complete out of order", async () => {
    const first = base();
    const second = { ...base(), id: "second-project", revision: 4 };
    const finish: Array<(raw: string) => void> = [];
    const fixture = createSyntheticEditProvider(
      () =>
        new Promise<string>((resolve) => {
          finish.push(resolve);
        }),
    );
    const a = createStructuredEditProposal(
      first,
      "First",
      fixture,
      new AbortController().signal,
    );
    const b = createStructuredEditProposal(
      second,
      "Second",
      fixture,
      new AbortController().signal,
    );
    finish[1](
      operations([
        { op: "update", blockId: "hero-heading", changes: { text: "Second" } },
      ]),
    );
    const secondProposal = await b;
    finish[0](
      operations([
        { op: "update", blockId: "hero-heading", changes: { text: "First" } },
      ]),
    );
    const firstProposal = await a;
    expect(previewEditProposal(first, firstProposal).blocks[0].text).toBe(
      "First",
    );
    expect(previewEditProposal(second, secondProposal).blocks[0].text).toBe(
      "Second",
    );
    expect(firstProposal.baseRevision).toBe(0);
    expect(secondProposal.baseRevision).toBe(4);
    expect(() => previewEditProposal(second, firstProposal)).toThrow(
      /stale|baseline/i,
    );
    expect(first).toEqual(base());
    expect(second.blocks).toEqual(base().blocks);
  });

  it("keeps transport context detached from the host baseline and returned proposal", async () => {
    const project = base();
    const before = projectSnapshot(project);
    let captured: EditProviderRequest | undefined;
    const fixture = createSyntheticEditProvider(async (request) => {
      captured = request;
      request.context.blocks[0].text = "Transport mutation";
      request.context.blocks.reverse();
      return operations([
        { op: "update", blockId: "hero-heading", changes: { text: "Welcome" } },
      ]);
    });
    const proposal = await createStructuredEditProposal(
      project,
      "Welcome",
      fixture,
      new AbortController().signal,
    );
    expect(proposal.baseSnapshot).toBe(before);
    expect(previewEditProposal(project, proposal).blocks[1]).toEqual(
      project.blocks[1],
    );
    captured!.context.blocks.length = 0;
    expect(previewEditProposal(project, proposal).blocks).toHaveLength(2);
    expect(projectSnapshot(project)).toBe(before);
  });

  it("turns synthetic natural-language output into the existing, snapshot-bound proposal without mutation", async () => {
    const project = base();
    const before = projectSnapshot(project);
    const source = provider(
      operations([
        {
          op: "update",
          blockId: "hero-heading",
          changes: { text: "Welcome to Kopi Senja" },
        },
        {
          op: "add",
          afterId: "hero-heading",
          block: { type: "paragraph", text: "Fresh pastries" },
        },
      ]),
    );
    const proposal = await createStructuredEditProposal(
      project,
      "Welcome to Kopi Senja and add Fresh pastries",
      source,
      new AbortController().signal,
    );
    expect(source.propose).toHaveBeenCalledOnce();
    expect(source.propose.mock.calls[0][0]).toMatchObject({
      instruction: "Welcome to Kopi Senja and add Fresh pastries",
      context: { name: project.name, blocks: project.blocks },
    });
    expect(JSON.stringify(source.propose.mock.calls[0][0])).not.toContain(
      "schemaVersion",
    );
    expect(proposal).toMatchObject({
      mode: "mock",
      projectId: project.id,
      baseRevision: project.revision,
      baseSnapshot: before,
    });
    const added = proposal.operations[1];
    expect(added.op).toBe("add");
    if (added.op !== "add") throw new Error("expected add");
    expect(added.block.id).toMatch(/^[\da-f-]{36}$/);
    expect(
      previewEditProposal(project, proposal).blocks.map((b) => b.text),
    ).toEqual([
      "Welcome to Kopi Senja",
      "Fresh pastries",
      project.blocks[1].text,
    ]);
    expect(projectSnapshot(project)).toBe(before);
  });

  it("accepts deterministic injected synthetic transport and rejects unsupported requests", async () => {
    const transport = vi.fn(async () =>
      operations([
        { op: "update", blockId: "hero-heading", changes: { text: "Welcome" } },
      ]),
    );
    const fixture = createSyntheticEditProvider(transport);
    const proposal = await createStructuredEditProposal(
      base(),
      "Change title to Welcome",
      fixture,
      new AbortController().signal,
    );
    expect(previewEditProposal(base(), proposal).blocks[0].text).toBe(
      "Welcome",
    );
    expect(transport).toHaveBeenCalledOnce();
    await expect(
      createStructuredEditProposal(
        base(),
        "Unknown instruction",
        createSyntheticEditProvider(),
        new AbortController().signal,
      ),
    ).rejects.toThrow(/unavailable|unsupported/i);
  });
});
