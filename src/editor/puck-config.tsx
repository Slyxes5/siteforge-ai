import { safeRenderUrl } from "../renderer/safe-url";
import type { Config } from "@puckeditor/core";
import type { Components } from "./project-adapter";
export { toPuckData } from "./project-adapter";
const textField = { type: "textarea", label: "Text" } as const;
const urlField = {
  type: "text",
  label: "URL (https, /path or #anchor)",
} as const;
export const puckConfig: Config<Components> = {
  root: {
    fields: {},
    render: ({ children }) => (
      <div className="document-content">{children}</div>
    ),
  },
  components: {
    features: {
      label: "Features / Services",
      fields: {
        text: { ...textField, label: "Section title" },
        layout: {
          type: "select",
          label: "Layout",
          options: [
            { label: "Grid", value: "grid" },
            { label: "List", value: "list" },
          ],
        },
        items: {
          type: "array",
          label: "Items",
          arrayFields: {
            title: { type: "text", label: "Item title" },
            description: { ...textField, label: "Item description" },
          },
          defaultItemProps: {
            title: "Your item",
            description: "Add your details.",
          },
          getItemSummary: (item) => item.title || "New item",
        },
      },
      defaultProps: {
        text: "Features and services",
        layout: "grid",
        items: [
          {
            title: "Your service",
            description: "Describe your verified offering.",
          },
          { title: "Another service", description: "Add your own details." },
        ],
      },
      render: ({ id, text, layout, items, puck }) => (
        <section
          id={puck.isEditing ? undefined : id}
          className="content-section tone-light"
        >
          <h2>{text}</h2>
          <div className={"feature-items layout-" + layout}>
            {items.map((item, index) => (
              <article key={index}>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </article>
            ))}
          </div>
        </section>
      ),
    },
    contact: {
      label: "Contact details",
      fields: {
        text: { ...textField, label: "Contact title" },
        body: { ...textField, label: "Contact introduction" },
        email: { type: "text", label: "Email" },
        phone: { type: "text", label: "Phone" },
        address: { ...textField, label: "Address" },
      },
      defaultProps: {
        text: "Contact",
        body: "Add your verified contact information.",
        email: "",
        phone: "",
        address: "",
      },
      render: ({ id, text, body, email, phone, address, puck }) => (
        <section
          id={puck.isEditing ? undefined : id}
          className="content-section tone-sage contact-block"
        >
          <h2>{text}</h2>
          <p>{body}</p>
          <dl>
            <dt>Email</dt>
            <dd>{email || "Email not provided"}</dd>
            <dt>Phone</dt>
            <dd>{phone || "Phone not provided"}</dd>
            <dt>Address</dt>
            <dd>{address || "Address not provided"}</dd>
          </dl>
          <p className="manager-help">
            Contact information only — no form submission or booking service.
          </p>
        </section>
      ),
    },
    heading: {
      label: "Heading",
      fields: { text: textField },
      defaultProps: { text: "Your next great idea." },
      render: ({ text }) => <h1 className="hero-title">{text}</h1>,
    },
    paragraph: {
      label: "Paragraph",
      fields: { text: textField },
      defaultProps: { text: "Tell your story here." },
      render: ({ text }) => <p className="hero-copy">{text}</p>,
    },
    button: {
      label: "Button",
      fields: { text: textField, href: urlField },
      defaultProps: { text: "Get in touch", href: "#contact" },
      render: ({ text, href, puck }) => (
        <a
          className="site-button"
          href={safeRenderUrl(href)}
          onClick={(e) => {
            if (puck.isEditing) e.preventDefault();
          }}
        >
          {text}
          <span aria-hidden="true"> ↗</span>
        </a>
      ),
    },
    image: {
      label: "Image",
      fields: {
        src: { ...urlField, label: "Image URL" },
        alt: { type: "text", label: "Alternative text" },
        text: { ...textField, label: "Caption" },
      },
      defaultProps: {
        src: "/sample-landscape.svg",
        alt: "Abstract landscape in sage green",
        text: "",
      },
      render: ({ src, alt, text }) => (
        <figure className="site-image">
          {src ? (
            <img src={safeRenderUrl(src)} alt={alt} loading="lazy" />
          ) : (
            <div className="image-placeholder">Choose an image URL</div>
          )}
          {text && <figcaption>{text}</figcaption>}
        </figure>
      ),
    },
    hero: {
      label: "Hero",
      fields: {
        text: { ...textField, label: "Headline" },
        subtitle: { ...textField, label: "Subtitle" },
        ctaText: { type: "text", label: "Button label" },
        ctaHref: urlField,
      },
      defaultProps: {
        text: "Build something remarkable.",
        subtitle: "Thoughtful experiences, built around your vision.",
        ctaText: "Discover more",
        ctaHref: "#about",
      },
      render: ({ text, subtitle, ctaText, ctaHref, puck }) => (
        <section className="hero-block">
          <span className="eyebrow">DESIGNED FOR WHAT’S NEXT</span>
          <h1 className="hero-title">{text}</h1>
          <p className="hero-copy">{subtitle}</p>
          {ctaText && (
            <a
              className="site-button"
              href={safeRenderUrl(ctaHref)}
              onClick={(e) => {
                if (puck.isEditing) e.preventDefault();
              }}
            >
              {ctaText} ↗
            </a>
          )}
        </section>
      ),
    },
    section: {
      label: "Section",
      fields: {
        text: { ...textField, label: "Section title" },
        body: { ...textField, label: "Body" },
        tone: {
          type: "select",
          label: "Color theme",
          options: [
            { label: "Light", value: "light" },
            { label: "Sage", value: "sage" },
            { label: "Dark", value: "dark" },
          ],
        },
      },
      defaultProps: {
        text: "A little about us.",
        body: "Share what makes your work different.",
        tone: "sage",
      },
      render: ({ id, text, body, tone, puck }) => (
        <section
          id={puck.isEditing ? undefined : id}
          className={"content-section tone-" + tone}
        >
          <h2>{text}</h2>
          <p>{body}</p>
        </section>
      ),
    },
  },
};
