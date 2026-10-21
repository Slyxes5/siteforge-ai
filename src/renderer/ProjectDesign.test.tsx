import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProjectRenderer } from "./ProjectRenderer";
import { sampleProject } from "../project-schema/project";
import { designPresetIds } from "../project-schema/design";

test.each(designPresetIds)(
  "renders %s using only host-owned theme selectors and safe text",
  (preset) => {
    const { container } = render(
      <ProjectRenderer
        project={{
          ...sampleProject,
          design: { preset },
          blocks: [
            { id: "title", type: "heading", text: "<script>alert(1)</script>" },
          ],
        }}
      />,
    );
    expect(container.querySelector(".project-design")).toHaveAttribute(
      "data-design",
      preset,
    );
    expect(container.querySelector("script,link,style")).toBeNull();
    expect(screen.getByRole("heading")).toHaveTextContent(
      "<script>alert(1)</script>",
    );
  },
);
test("legacy rendering adds no design wrapper or selectors", () => {
  const { container } = render(<ProjectRenderer project={sampleProject} />);
  expect(container.querySelector(".project-design")).toBeNull();
  expect(screen.getByRole("heading")).toHaveTextContent(
    sampleProject.blocks[0].text,
  );
});
