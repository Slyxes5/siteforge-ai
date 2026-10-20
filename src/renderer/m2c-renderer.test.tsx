import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProjectRenderer } from "./ProjectRenderer";
import { projectSchema, sampleProject } from "../project-schema/project";
test("M2C renders safe editable feature lists and static contact with no fake action", () => {
  const project = projectSchema.parse({
    ...sampleProject,
    blocks: [
      {
        id: "services",
        type: "features",
        text: "Services",
        layout: "grid",
        items: [
          {
            title: "<script>never execute</script>",
            description: "Service description",
          },
        ],
      },
      {
        id: "contact",
        type: "contact",
        text: "Contact",
        body: "Use your verified details.",
        email: "",
        phone: "",
        address: "",
      },
    ],
  });
  const { container } = render(<ProjectRenderer project={project} />);
  expect(screen.getByRole("heading", { name: "Services" })).toBeInTheDocument();
  expect(
    screen.getByText("<script>never execute</script>"),
  ).toBeInTheDocument();
  expect(screen.getByText("Service description")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Contact" })).toBeInTheDocument();
  expect(screen.getByText("Email not provided")).toBeInTheDocument();
  expect(container.querySelector(".feature-items.layout-grid")).not.toBeNull();
  expect(container.querySelector("#contact")).not.toBeNull();
  expect(container.querySelector("script, form")).toBeNull();
});
