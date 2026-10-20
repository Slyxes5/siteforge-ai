import { z } from "zod";
import { projectSchema, type Project } from "../project-schema/project";
export const templateIds = [
  "business",
  "coffee-shop",
  "barbershop",
  "portfolio",
  "car-rental",
] as const;
export type TemplateId = (typeof templateIds)[number];
export const templates = [
  { id: "business", label: "General business" },
  { id: "coffee-shop", label: "Coffee shop" },
  { id: "barbershop", label: "Barbershop" },
  { id: "portfolio", label: "Portfolio" },
  { id: "car-rental", label: "Car rental" },
] satisfies { id: TemplateId; label: string }[];
const copy: Record<
  TemplateId,
  {
    headline: string;
    about: string;
    body: string;
    cta: string;
    details: string;
    contactTitle?: string;
    contactBody?: string;
  }
> = {
  "car-rental": {
    headline: "Car rental website placeholder — add your own introduction.",
    about: "About your rental service · Placeholder",
    body: "Placeholder: describe your vehicles, rental terms, and enquiry process using verified details. Add actual availability and pricing only when confirmed.",
    cta: "Rental enquiry details",
    details: "Vehicle information · Placeholder",
    contactTitle: "Rental enquiry · Placeholder",
    contactBody:
      "Template-generated placeholder, not AI-generated. Add your verified contact details and enquiry instructions here. This page does not check vehicle availability, accept bookings, or process payments.",
  },
  business: {
    headline: "Thoughtful solutions. Lasting value.",
    about: "Built around your goals",
    body: "Introduce your services, approach, and the people behind your work.",
    cta: "Start a conversation",
    details: "Our services",
  },
  "coffee-shop": {
    headline: "Good coffee. Better company.",
    about: "Your neighborhood coffee stop",
    body: "Share your signature drinks, seasonal favorites, and the story behind every cup.",
    cta: "Plan your visit",
    details: "On the menu",
  },
  barbershop: {
    headline: "A fresh cut. A confident start.",
    about: "Craft, care, and a great conversation",
    body: "Introduce your cuts, grooming services, and the team behind the chair.",
    cta: "Ask about an appointment",
    details: "Cuts and grooming",
  },
  portfolio: {
    headline: "Selected work. A personal perspective.",
    about: "The person behind the projects",
    body: "Share your experience, creative process, and the projects you are proud of.",
    cta: "Let’s collaborate",
    details: "Selected projects",
  },
};
const requestSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000),
  templateId: z.enum(templateIds),
});
export type GenerationRequest = z.infer<typeof requestSchema>;
/** Pure template expansion. Identity is provided by the caller, never invented by AI. */
export function generateProject(input: GenerationRequest): Project {
  const request = requestSchema.parse(input);
  const selected = copy[request.templateId];
  const id = (suffix: string) => request.id + "-" + suffix;
  return projectSchema.parse({
    schemaVersion: 1,
    id: request.id,
    name: request.name,
    description: request.description,
    revision: 0,
    generation: {
      kind: "template",
      templateId: request.templateId,
      templateVersion: 1,
    },
    blocks: [
      {
        id: id("hero"),
        type: "hero",
        text: request.name,
        subtitle: request.description || selected.headline,
        ctaText: selected.cta,
        ctaHref: "#" + id("contact"),
      },
      {
        id: id("about"),
        type: "section",
        text: selected.about,
        body: request.description || selected.body,
        tone: "sage",
      },
      {
        id: id("image"),
        type: "image",
        src: "/sample-landscape.svg",
        alt: "Abstract landscape placeholder — replace with your own image",
        text: "Sample image · Replace in the editor",
      },
      { id: id("heading"), type: "heading", text: selected.details },
      { id: id("copy"), type: "paragraph", text: selected.body },
      {
        id: id("contact"),
        type: "section",
        text: selected.contactTitle ?? "Get in touch",
        body:
          selected.contactBody ??
          "Add your contact details, availability, or next steps here. This is placeholder content, not a working booking form.",
        tone: "light",
      },
      {
        id: id("button"),
        type: "button",
        text: selected.cta,
        href: "#" + id("contact"),
      },
    ],
  });
}
