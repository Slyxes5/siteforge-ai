export const storageKey = "siteforge:project:v1:siteforge-starter";
export const fullProject = {
  schemaVersion: 1,
  id: "siteforge-starter",
  name: "Studio North",
  revision: 0,
  blocks: [
    {
      id: "hero-heading",
      type: "heading",
      text: "Great ideas deserve a place to grow.",
    },
    {
      id: "hero-copy",
      type: "paragraph",
      text: "Independent design for ambitious ideas.",
    },
    { id: "button", type: "button", text: "Contact us", href: "#contact" },
    {
      id: "image",
      type: "image",
      text: "A new perspective",
      src: "/sample-landscape.svg",
      alt: "Sage landscape",
    },
    {
      id: "hero",
      type: "hero",
      text: "Made for what is next.",
      subtitle: "A thoughtful digital studio.",
      ctaText: "Explore our work",
      ctaHref: "#work",
    },
    {
      id: "section",
      type: "section",
      text: "About our studio",
      body: "Small team. Big possibilities.",
      tone: "sage",
    },
  ],
};
