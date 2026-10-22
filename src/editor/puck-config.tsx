import { safeRenderUrl } from "../renderer/safe-url";
import { Gallery } from "../renderer/Gallery";
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
      <div className="document-content" id="top">
        {children}
      </div>
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
    menu: {
      label: "Menu / products",
      fields: {
        text: { ...textField, label: "Section title" },
        items: {
          type: "array",
          label: "Menu items",
          arrayFields: {
            title: { type: "text", label: "Item name" },
            description: { ...textField, label: "Description" },
            price: { type: "text", label: "Price (optional)" },
            imageSrc: { ...urlField, label: "Photo URL (optional)" },
            imageAlt: { type: "text", label: "Photo alternative text" },
          },
          defaultItemProps: {
            title: "Your menu item",
            description: "Add a verified description.",
            price: "",
            imageSrc: "",
            imageAlt: "",
          },
          getItemSummary: (item) => item.title || "New menu item",
        },
      },
      defaultProps: {
        text: "Menu",
        items: [
          { title: "House favorite", description: "Add details.", price: "" },
          { title: "Seasonal pick", description: "Add details.", price: "" },
        ],
      },
      render: ({ id, text, items, puck }) => (
        <section
          id={puck.isEditing ? undefined : id}
          className="content-section tone-light menu-block"
        >
          <h2>{text}</h2>
          <div
            className={
              "menu-items" +
              (items.some((item) => item.imageSrc !== undefined)
                ? " menu-cards"
                : "")
            }
          >
            {items.map((item, index) => (
              <article key={index}>
                {item.imageSrc !== undefined && (
                  <div className="menu-photo">
                    {item.imageSrc ? (
                      <img
                        src={safeRenderUrl(item.imageSrc)}
                        alt={item.imageAlt ?? item.title}
                        loading="lazy"
                        width="600"
                        height="480"
                      />
                    ) : (
                      <div className="photo-slot">
                        <span aria-hidden="true">＋</span>
                        <span>Tempat foto menu</span>
                      </div>
                    )}
                    {item.imageSrc?.startsWith("/graphics/coffee-") && (
                      <span className="art-caption">
                        Ilustrasi · siap diganti foto
                      </span>
                    )}
                  </div>
                )}
                <div className="menu-item-heading">
                  <h3>{item.title}</h3>
                  {item.price && <span>{item.price}</span>}
                  {!item.price && item.imageSrc !== undefined && (
                    <span className="menu-price-placeholder">
                      Harga belum diisi
                    </span>
                  )}
                </div>
                <p>{item.description}</p>
              </article>
            ))}
          </div>
        </section>
      ),
    },
    gallery: {
      label: "Gallery",
      fields: {
        text: { ...textField, label: "Section title" },
        layout: {
          type: "select",
          label: "Gallery layout",
          options: [
            { label: "Grid", value: "grid" },
            { label: "Carousel", value: "carousel" },
          ],
        },
        items: {
          type: "array",
          label: "Gallery images",
          arrayFields: {
            src: urlField,
            alt: { type: "text", label: "Alternative text" },
            caption: { type: "text", label: "Caption (optional)" },
          },
          defaultItemProps: {
            src: "/sample-landscape.svg",
            alt: "Replace this placeholder with a café photo",
            caption: "",
          },
          getItemSummary: (item) => item.caption || item.alt || "Gallery image",
        },
      },
      defaultProps: {
        text: "A look inside",
        items: [
          {
            src: "/sample-landscape.svg",
            alt: "Replace this placeholder with a café photo",
            caption: "",
          },
          {
            src: "/sample-landscape.svg",
            alt: "Replace this placeholder with a coffee photo",
            caption: "",
          },
        ],
      },
      render: ({ id, text, items, layout, puck }) => (
        <section
          id={puck.isEditing ? undefined : id}
          className="content-section tone-light gallery-block"
        >
          <h2>{text}</h2>
          <Gallery
            text={text}
            items={items}
            layout={layout}
            editing={puck.isEditing}
          />
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
        openingHours: { ...textField, label: "Opening hours (optional)" },
      },
      defaultProps: {
        text: "Contact",
        body: "Add your verified contact information.",
        email: "",
        phone: "",
        address: "",
        openingHours: "",
      },
      render: ({
        id,
        text,
        body,
        email,
        phone,
        address,
        openingHours,
        puck,
      }) => (
        <section
          id={puck.isEditing ? undefined : id}
          className="content-section tone-sage contact-block"
        >
          <h2>{text}</h2>
          <p>{body}</p>
          <dl>
            {email && (
              <>
                <dt>Email</dt>
                <dd>{email}</dd>
              </>
            )}
            {phone && (
              <>
                <dt>Phone</dt>
                <dd>{phone}</dd>
              </>
            )}
            {address && (
              <>
                <dt>Address</dt>
                <dd>{address}</dd>
              </>
            )}
            {openingHours && (
              <>
                <dt>Opening hours</dt>
                <dd>{openingHours}</dd>
              </>
            )}
          </dl>
          {!email && !phone && !address && !openingHours && (
            <p className="manager-help">
              Add your public contact details here.
            </p>
          )}
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
        visual: {
          type: "select",
          label: "Hero composition",
          options: [
            { label: "Original", value: "plain" },
            { label: "Coffee editorial", value: "coffee-editorial" },
          ],
        },
        imageSrc: { ...urlField, label: "Hero photo / illustration URL" },
        imageAlt: { type: "text", label: "Hero image alternative text" },
      },
      defaultProps: {
        text: "Build something remarkable.",
        subtitle: "Thoughtful experiences, built around your vision.",
        ctaText: "Discover more",
        ctaHref: "#about",
      },
      render: ({
        text,
        subtitle,
        ctaText,
        ctaHref,
        visual,
        imageSrc,
        imageAlt,
        puck,
      }) => (
        <section
          className={
            "hero-block" + (visual === "coffee-editorial" ? " coffee-hero" : "")
          }
        >
          {visual === "coffee-editorial" ? (
            <>
              <div className="coffee-hero-copy">
                <span className="coffee-kicker">Coffee & slow moments</span>
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
                    {ctaText} <span aria-hidden="true">↗</span>
                  </a>
                )}
              </div>
              <figure className="coffee-hero-art">
                <div className="coffee-orbit" aria-hidden="true" />
                {imageSrc ? (
                  <img
                    src={safeRenderUrl(imageSrc)}
                    alt={imageAlt ?? ""}
                    width="1000"
                    height="1100"
                  />
                ) : (
                  <div className="photo-slot">Tempat foto utama</div>
                )}
                {imageSrc?.startsWith("/graphics/coffee-") && (
                  <figcaption>
                    Ilustrasi editorial · ruang untuk foto Anda
                  </figcaption>
                )}
                <span className="coffee-art-mark" aria-hidden="true">
                  A little pause
                  <br />A warmer day
                </span>
              </figure>
            </>
          ) : (
            <>
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
            </>
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
