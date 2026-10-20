import { describe, expect, it } from "vitest";
import { sampleProject, type Project } from "../project-schema/project";
import {
  createEditProposal,
  editProposalSchema,
  previewEditProposal,
  projectSnapshot,
} from "./edit-proposal";

const base = (): Project => structuredClone(sampleProject);

describe("edit proposal", () => {
  it.each(['update photo src "/new.svg"', "update photo src '/new.svg'"])(
    "accepts the exact quoted root-relative image source: %s",
    (request) => {
      const project: Project = {
        ...base(),
        blocks: [
          {
            id: "photo",
            type: "image",
            text: "",
            src: "/old.svg",
            alt: "Photo",
          },
        ],
      };
      const proposal = createEditProposal(project, request, [
        { op: "update", blockId: "photo", changes: { src: "/new.svg" } },
      ]);
      expect(previewEditProposal(project, proposal).blocks[0]).toMatchObject({
        id: "photo",
        src: "/new.svg",
      });
      expect(() =>
        createEditProposal(project, request, [
          { op: "update", blockId: "photo", changes: { src: "/new" } },
        ]),
      ).toThrow(/URL|source/i);
    },
  );
  it("excludes URLs embedded in names, descriptions and visible text from numeric evidence", () => {
    const project: Project = {
      ...base(),
      name: "https://example.com/777",
      description: "Visit https://example.com/888",
      blocks: [
        {
          id: "heading",
          type: "heading",
          text: "Visit https://example.com/999",
        },
      ],
    };
    for (const number of ["777", "888", "999"]) {
      expect(() =>
        createEditProposal(project, "Rewrite", [
          {
            op: "update",
            blockId: "heading",
            changes: { text: `${number} clients` },
          },
        ]),
      ).toThrow(/UNSUPPORTED_BUSINESS_FACT/);
    }
  });
  it("detaches nested update payloads from their caller", () => {
    const project: Project = {
      ...base(),
      blocks: [
        {
          id: "features",
          type: "features",
          text: "Services",
          layout: "grid",
          items: [{ title: "Original", description: "" }],
        },
      ],
    };
    const items = [{ title: "Fresh", description: "" }];
    const proposal = createEditProposal(project, "Fresh", [
      { op: "update", blockId: "features", changes: { items } },
    ]);
    items[0].title = "Caller mutation";
    expect(previewEditProposal(project, proposal).blocks[0]).toMatchObject({
      items: [{ title: "Fresh" }],
    });
  });
  it("bounds strict proposal payloads and revalidates untrusted preview input", () => {
    const project = base();
    const proposal = createEditProposal(project, "Welcome", [
      { op: "update", blockId: "hero-heading", changes: { text: "Welcome" } },
    ]);
    for (const invalid of [
      { ...proposal, extra: true },
      { ...proposal, mode: "live" },
      { ...proposal, version: 2 },
      { ...proposal, operations: [] },
      { ...proposal, operations: Array(101).fill(proposal.operations[0]) },
      { ...proposal, request: "x".repeat(10001) },
      { ...proposal, summary: "" },
      { ...proposal, operations: [{ ...proposal.operations[0], extra: true }] },
      {
        ...proposal,
        operations: [
          {
            op: "add",
            afterId: null,
            block: {
              id: "fresh",
              type: "heading",
              text: "Welcome",
              extra: true,
            },
          },
        ],
      },
      {
        ...proposal,
        operations: [
          {
            op: "update",
            blockId: "hero-heading",
            changes: { unknown: "x".repeat(1_000_001) },
          },
        ],
      },
      { ...proposal, baseSnapshot: "x".repeat(8_000_001) },
    ]) {
      expect(editProposalSchema.safeParse(invalid).success).toBe(false);
      expect(() => previewEditProposal(project, invalid)).toThrow();
    }
    expect(() =>
      previewEditProposal(project, {
        ...proposal,
        operations: [
          { op: "update", blockId: "hero-heading", changes: { id: "new" } },
        ],
      }),
    ).toThrow();
  });
  it.each<Project["blocks"][number]>([
    { id: "target", type: "heading", text: "Welcome" },
    { id: "target", type: "paragraph", text: "Welcome" },
    { id: "target", type: "button", text: "Open", href: "#" },
    { id: "target", type: "image", text: "", src: "", alt: "Photo" },
    {
      id: "target",
      type: "hero",
      text: "Welcome",
      subtitle: "",
      ctaText: "",
      ctaHref: "",
    },
  ])("rejects newly introduced anchors to non-rendered $type IDs", (target) => {
    const project: Project = {
      ...base(),
      blocks: [target, { id: "link", type: "button", text: "Open", href: "#" }],
    };
    expect(() =>
      createEditProposal(project, "Rewrite", [
        { op: "update", blockId: "link", changes: { href: "#target" } },
      ]),
    ).toThrow(/anchor/i);
    expect(() =>
      createEditProposal(project, "Rewrite", [
        {
          op: "add",
          afterId: null,
          block: {
            id: "new-link",
            type: "button",
            text: "Open",
            href: "#target",
          },
        },
      ]),
    ).toThrow(/anchor/i);
  });
  it.each<Project["blocks"][number]>([
    { id: "target", type: "section", text: "Welcome", body: "", tone: "light" },
    {
      id: "target",
      type: "features",
      text: "Services",
      layout: "grid",
      items: [{ title: "Design", description: "" }],
    },
    {
      id: "target",
      type: "contact",
      text: "Contact",
      body: "",
      email: "",
      phone: "",
      address: "",
    },
  ])("accepts newly introduced anchors to rendered $type IDs", (target) => {
    const project: Project = {
      ...base(),
      blocks: [{ id: "link", type: "button", text: "Open", href: "#" }],
    };
    const proposal = createEditProposal(project, "Rewrite", [
      { op: "update", blockId: "link", changes: { href: "#target" } },
      { op: "add", afterId: null, block: target },
    ]);
    expect(previewEditProposal(project, proposal).blocks).toEqual([
      target,
      { id: "link", type: "button", text: "Open", href: "#target" },
    ]);
  });
  it("retains untouched legacy anchors to IDs the renderer does not emit", () => {
    const project: Project = {
      ...base(),
      blocks: [
        { id: "target", type: "heading", text: "Welcome" },
        { id: "link", type: "button", text: "Open", href: "#target" },
      ],
    };
    const proposal = createEditProposal(project, "Rewrite", [
      { op: "update", blockId: "target", changes: { text: "Fresh" } },
    ]);
    expect(previewEditProposal(project, proposal).blocks[1]).toEqual(
      project.blocks[1],
    );
    expect(() =>
      createEditProposal(project, "Rewrite", [
        { op: "remove", blockId: "target" },
      ]),
    ).not.toThrow();
  });
  it("checks final anchors without rejecting untouched legacy dangling links", () => {
    const project: Project = {
      ...base(),
      blocks: [
        {
          id: "target",
          type: "section",
          text: "Welcome",
          body: "",
          tone: "light",
        },
        { id: "link", type: "button", text: "Open", href: "#target" },
        {
          id: "legacy",
          type: "hero",
          text: "Legacy",
          subtitle: "",
          ctaText: "Open",
          ctaHref: "#missing",
        },
      ],
    };
    expect(() =>
      createEditProposal(project, "Rewrite", [
        { op: "update", blockId: "target", changes: { text: "Fresh" } },
      ]),
    ).not.toThrow();
    expect(() =>
      createEditProposal(project, "Rewrite", [
        { op: "remove", blockId: "target" },
      ]),
    ).toThrow(/anchor/i);
    expect(() =>
      createEditProposal(project, "Rewrite", [
        { op: "update", blockId: "link", changes: { href: "#missing" } },
      ]),
    ).toThrow(/anchor/i);
    expect(() =>
      createEditProposal(project, "Rewrite", [
        { op: "update", blockId: "legacy", changes: { ctaHref: "#other" } },
      ]),
    ).toThrow(/anchor/i);
    expect(() =>
      createEditProposal(project, "Rewrite", [
        {
          op: "add",
          afterId: null,
          block: { id: "new", type: "button", text: "Open", href: "#missing" },
        },
      ]),
    ).toThrow(/anchor/i);
    expect(() =>
      createEditProposal(project, "Rewrite", [
        { op: "remove", blockId: "target" },
        { op: "remove", blockId: "link" },
      ]),
    ).not.toThrow();
    expect(() =>
      createEditProposal(project, "Rewrite", [
        { op: "update", blockId: "link", changes: { href: "#new" } },
        {
          op: "add",
          afterId: null,
          block: {
            id: "new",
            type: "section",
            text: "Welcome",
            body: "",
            tone: "light",
          },
        },
      ]),
    ).not.toThrow();
  });
  it("requires exact grounded newly changed external URLs and image sources", () => {
    const project: Project = {
      ...base(),
      blocks: [
        {
          id: "link",
          type: "button",
          text: "Open",
          href: "https://old.example/path",
        },
        {
          id: "image",
          type: "image",
          text: "",
          src: "https://old.example/photo.png",
          alt: "Photo",
        },
      ],
    };
    for (const operation of [
      {
        op: "update",
        blockId: "link",
        changes: { href: "https://invented.example" },
      },
      {
        op: "update",
        blockId: "image",
        changes: { src: "https://invented.example/photo.png" },
      },
      {
        op: "add",
        afterId: null,
        block: {
          id: "new",
          type: "image",
          text: "",
          src: "https://invented.example/photo.png",
          alt: "",
        },
      },
    ])
      expect(() => createEditProposal(project, "Rewrite", [operation])).toThrow(
        /URL|source/i,
      );
    expect(() =>
      createEditProposal(project, "Use https://new.example/path", [
        {
          op: "update",
          blockId: "link",
          changes: { href: "https://new.example/path" },
        },
      ]),
    ).not.toThrow();
    expect(() =>
      createEditProposal(project, "Use https://new.example/pathology", [
        {
          op: "update",
          blockId: "link",
          changes: { href: "https://new.example/path" },
        },
      ]),
    ).toThrow(/URL|source/i);
    expect(() =>
      createEditProposal(project, "Copy", [
        {
          op: "update",
          blockId: "link",
          changes: { href: "https://old.example/photo.png" },
        },
      ]),
    ).not.toThrow();
    expect(() =>
      createEditProposal(project, "Rewrite", [
        { op: "update", blockId: "image", changes: { alt: "Fresh photo" } },
      ]),
    ).not.toThrow();
  });
  it.each([
    'update 2020 text "Since 2020"',
    'ubah 2020 text "Since 2020"',
    'add paragraph after 2020 {"text":"Since 2020"}',
    'update heading items [{"title":"Since 2020","description":""}]',
  ])(
    "preserves JSON literal numeric evidence matching a block ID: %s",
    (request) => {
      const project: Project = {
        ...base(),
        blocks: [{ id: "2020", type: "heading", text: "Welcome" }],
      };
      const proposal = createEditProposal(project, request, [
        { op: "update", blockId: "2020", changes: { text: "Since 2020" } },
      ]);
      expect(previewEditProposal(project, proposal).blocks[0].text).toBe(
        "Since 2020",
      );
    },
  );
  it.each([
    'update 2020 text "Welcome"',
    'ubah 2020 text "Welcome"',
    'add paragraph after 2020 {"text":"Welcome"}',
    "remove 2020",
    "reorder heading,2020",
  ])(
    "does not treat command target IDs as numeric fact evidence: %s",
    (request) => {
      const project: Project = {
        ...base(),
        blocks: [{ id: "2020", type: "heading", text: "Welcome" }],
      };
      expect(() =>
        createEditProposal(project, request, [
          { op: "update", blockId: "2020", changes: { text: "Since 2020" } },
        ]),
      ).toThrow(/UNSUPPORTED_BUSINESS_FACT/);
    },
  );
  it("does not strip a block ID substring from an explicitly supplied fact", () => {
    const project: Project = {
      ...base(),
      blocks: [{ id: "20", type: "heading", text: "Welcome" }],
    };
    const proposal = createEditProposal(
      project,
      'update 20 text "Since 2020"',
      [{ op: "update", blockId: "20", changes: { text: "Since 2020" } }],
    );
    expect(previewEditProposal(project, proposal).blocks[0].text).toBe(
      "Since 2020",
    );
  });
  it("does not launder numeric facts through IDs or URLs or earlier edits", () => {
    const project: Project = {
      ...base(),
      id: "project-777",
      blocks: [
        { id: "section-999", type: "heading", text: "Welcome" },
        {
          id: "link",
          type: "button",
          text: "Open",
          href: "https://example.com/888",
        },
      ],
    };
    for (const text of ["777 clients", "888 clients", "999 clients"]) {
      expect(() =>
        createEditProposal(project, "Rewrite", [
          { op: "update", blockId: "section-999", changes: { text } },
        ]),
      ).toThrow(/UNSUPPORTED_BUSINESS_FACT/);
    }
    expect(() =>
      createEditProposal(
        project,
        "update section-999 text https://example.com/888",
        [
          {
            op: "update",
            blockId: "section-999",
            changes: { text: "888 clients" },
          },
        ],
      ),
    ).toThrow(/UNSUPPORTED_BUSINESS_FACT/);
    expect(() =>
      createEditProposal(project, "update section-999 text", [
        {
          op: "update",
          blockId: "section-999",
          changes: { text: "999 clients" },
        },
      ]),
    ).toThrow(/UNSUPPORTED_BUSINESS_FACT/);
    expect(() =>
      createEditProposal(project, "Rewrite", [
        {
          op: "update",
          blockId: "section-999",
          changes: { text: "123 clients" },
        },
        { op: "update", blockId: "link", changes: { text: "123" } },
      ]),
    ).toThrow(/UNSUPPORTED_BUSINESS_FACT/);
  });
  it("grounds numeric/email/contact changes in visible original content and request", () => {
    const project: Project = {
      ...base(),
      description: "Since 2020",
      blocks: [
        { id: "heading", type: "heading", text: "Save 25%" },
        {
          id: "features",
          type: "features",
          text: "Services",
          layout: "grid",
          items: [{ title: "Team of 8", description: "Serving 12 cities" }],
        },
        {
          id: "contact",
          type: "contact",
          text: "Contact",
          body: "",
          email: "hello@example.com",
          phone: "+60123456789",
          address: "Maple Lane",
        },
      ],
    };
    for (const text of ["2020", "25%", "8", "12", "hello@example.com"]) {
      expect(() =>
        createEditProposal(project, "Rewrite", [
          { op: "update", blockId: "heading", changes: { text } },
        ]),
      ).not.toThrow();
    }
    expect(() =>
      createEditProposal(project, "Our price is USD 10", [
        { op: "update", blockId: "heading", changes: { text: "USD 10" } },
      ]),
    ).not.toThrow();
    expect(() =>
      createEditProposal(project, "Rewrite", [
        {
          op: "add",
          afterId: null,
          block: {
            id: "copy",
            type: "contact",
            text: "Contact",
            body: "",
            email: "hello@example.com",
            phone: "+60123456789",
            address: "Maple Lane",
          },
        },
      ]),
    ).not.toThrow();
    for (const changes of [
      { text: "999 clients" },
      { text: "fake@example.com" },
    ]) {
      expect(() =>
        createEditProposal(project, "Rewrite", [
          { op: "update", blockId: "heading", changes },
        ]),
      ).toThrow(/UNSUPPORTED_BUSINESS_FACT/);
    }
    expect(() =>
      createEditProposal(project, "Rewrite", [
        {
          op: "update",
          blockId: "contact",
          changes: { address: "Invented Avenue" },
        },
      ]),
    ).toThrow(/UNSUPPORTED_BUSINESS_FACT/);
    expect(() =>
      createEditProposal(project, "Rewrite", [
        {
          op: "update",
          blockId: "features",
          changes: { items: [{ title: "999 clients", description: "" }] },
        },
      ]),
    ).toThrow(/UNSUPPORTED_BUSINESS_FACT/);
  });
  it.each([
    [
      { op: "remove", blockId: "hero-heading" },
      {
        op: "add",
        block: { id: "hero-heading", type: "heading", text: "Welcome" },
        afterId: null,
      },
    ],
    [
      {
        op: "add",
        block: { id: "fresh", type: "heading", text: "Welcome" },
        afterId: null,
      },
      { op: "remove", blockId: "fresh" },
      {
        op: "add",
        block: { id: "fresh", type: "heading", text: "Welcome" },
        afterId: null,
      },
    ],
    [
      {
        op: "add",
        block: { id: "hero-heading", type: "heading", text: "Welcome" },
        afterId: null,
      },
      { op: "remove", blockId: "hero-heading" },
    ],
    [{ op: "remove", blockId: "missing" }],
    [
      {
        op: "add",
        block: { id: "fresh", type: "heading", text: "Welcome" },
        afterId: "missing",
      },
    ],
    [{ op: "reorder", blockIds: ["hero-heading"] }],
    [{ op: "reorder", blockIds: ["hero-heading", "hero-heading"] }],
    [{ op: "reorder", blockIds: ["hero-heading", "missing"] }],
  ])(
    "rejects reused IDs, unknown targets and invalid permutations: %j",
    (...operations) => {
      expect(() => createEditProposal(base(), "Welcome", operations)).toThrow();
    },
  );
  it("applies add/remove/reorder sequentially in one immutable atomic preview", () => {
    const project = base();
    const before = structuredClone(project);
    const proposal = createEditProposal(project, "Welcome", [
      {
        op: "add",
        block: { id: "start", type: "paragraph", text: "Welcome" },
        afterId: null,
      },
      {
        op: "add",
        block: { id: "end", type: "heading", text: "Welcome" },
        afterId: "hero-copy",
      },
      { op: "remove", blockId: "hero-heading" },
      { op: "reorder", blockIds: ["end", "hero-copy", "start"] },
    ]);
    expect(
      previewEditProposal(project, proposal).blocks.map((block) => block.id),
    ).toEqual(["end", "hero-copy", "start"]);
    expect(project).toEqual(before);
    const onlyAdd = createEditProposal(project, "Welcome", [
      {
        op: "add",
        block: { id: "start", type: "paragraph", text: "Welcome" },
        afterId: null,
      },
    ]);
    expect(previewEditProposal(project, onlyAdd).blocks[0].id).toBe("start");
  });
  it.each([
    { blockId: "missing", changes: { text: "Welcome" } },
    { blockId: "hero-heading", changes: { id: "replacement" } },
    { blockId: "hero-heading", changes: { type: "paragraph" } },
    { blockId: "hero-heading", changes: { unknown: "value" } },
    { blockId: "hero-heading", changes: {} },
    { blockId: "hero-heading", changes: { text: "" } },
    { blockId: "hero-heading", changes: { text: 42 } },
  ])("rejects invalid updates atomically: %j", (operation) => {
    const project = base();
    const before = structuredClone(project);
    expect(() =>
      createEditProposal(project, "Welcome", [
        { op: "update", blockId: "hero-copy", changes: { text: "Welcome" } },
        { op: "update", ...operation },
      ]),
    ).toThrow();
    expect(project).toEqual(before);
  });
  it("compares canonical baselines including same-revision unsaved edits", () => {
    const project = base();
    const proposal = createEditProposal(project, "Welcome", [
      { op: "update", blockId: "hero-heading", changes: { text: "Welcome" } },
    ]);
    const reorderedKeys = {
      blocks: project.blocks.map((block) => ({
        text: block.text,
        type: block.type,
        id: block.id,
      })),
      revision: project.revision,
      name: project.name,
      id: project.id,
      schemaVersion: project.schemaVersion,
    } as Project;
    expect(projectSnapshot(reorderedKeys)).toBe(projectSnapshot(project));
    expect(previewEditProposal(reorderedKeys, proposal).blocks[0].text).toBe(
      "Welcome",
    );
    for (const changed of [
      { ...project, name: "Unsaved" },
      { ...project, revision: 1 },
      { ...project, id: "other" },
      { ...project, blocks: [{ ...project.blocks[0], text: "Unsaved" }] },
    ]) {
      expect(() => previewEditProposal(changed, proposal)).toThrow(
        /baseline|stale/i,
      );
    }
  });
  it("previews an update immutably without changing revision or metadata", () => {
    const project = base();
    const before = structuredClone(project);
    const operations = [
      { op: "update", blockId: "hero-heading", changes: { text: "Welcome" } },
    ];
    const proposal = createEditProposal(project, "Say welcome", operations);
    expect(proposal).toMatchObject({
      version: 1,
      mode: "mock",
      projectId: project.id,
      baseRevision: 0,
      request: "Say welcome",
      baseSnapshot: projectSnapshot(project),
    });
    expect(proposal.id).toBeTruthy();
    expect(proposal.summary.trim()).not.toBe("");
    const preview = previewEditProposal(project, proposal);
    expect(preview.blocks[0]).toEqual({
      ...project.blocks[0],
      text: "Welcome",
    });
    expect({ ...preview, blocks: [] }).toEqual({ ...project, blocks: [] });
    expect(project).toEqual(before);
    expect(preview.blocks).not.toBe(project.blocks);
    operations[0].changes.text = "Mutated";
    expect(previewEditProposal(project, proposal).blocks[0].text).toBe(
      "Welcome",
    );
  });
});
