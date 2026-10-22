import { useRef, useState } from "react";
import type { Block } from "../project-schema/project";
import { safeRenderUrl } from "./safe-url";

type GalleryBlock = Extract<Block, { type: "gallery" }>;
/** Native scrolling supports touch; controls never autoplay or mutate the project. */
export function Gallery({
  items,
  layout,
  text,
  editing = false,
}: Pick<GalleryBlock, "items" | "layout" | "text"> & { editing?: boolean }) {
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const carousel = layout === "carousel" && !editing;
  const index = Math.min(active, Math.max(0, items.length - 1));
  const go = (next: number) => {
    const element = track.current;
    if (!element) return;
    const bounded = Math.min(items.length - 1, Math.max(0, next));
    const reduce = element.ownerDocument.defaultView?.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    element.scrollTo({
      left: bounded * element.clientWidth,
      behavior: reduce ? "instant" : "smooth",
    });
  };
  return (
    <div className={carousel ? "gallery-carousel" : "gallery-grid"}>
      <div
        ref={track}
        className={carousel ? "gallery-track" : "gallery-items"}
        role={carousel ? "region" : undefined}
        aria-label={carousel ? text : undefined}
        aria-roledescription={carousel ? "carousel" : undefined}
        tabIndex={carousel ? 0 : undefined}
        onScroll={
          carousel
            ? (event) => {
                const element = event.currentTarget;
                if (element.clientWidth)
                  setActive(
                    Math.round(element.scrollLeft / element.clientWidth),
                  );
              }
            : undefined
        }
        onKeyDown={
          carousel
            ? (event) => {
                if (event.target !== event.currentTarget) return;
                if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                  event.preventDefault();
                  go(index + (event.key === "ArrowRight" ? 1 : -1));
                }
                if (event.key === "Home" || event.key === "End") {
                  event.preventDefault();
                  go(event.key === "Home" ? 0 : items.length - 1);
                }
              }
            : undefined
        }
      >
        {items.map((item, itemIndex) => (
          <figure
            key={itemIndex}
            role={carousel ? "group" : undefined}
            aria-roledescription={carousel ? "slide" : undefined}
            aria-label={
              carousel ? `${itemIndex + 1} / ${items.length}` : undefined
            }
          >
            <img
              src={safeRenderUrl(item.src)}
              alt={item.alt}
              loading="lazy"
              width="1200"
              height="900"
            />
            {item.caption && <figcaption>{item.caption}</figcaption>}
          </figure>
        ))}
      </div>
      {carousel && items.length > 1 && (
        <div
          className="gallery-controls"
          role="group"
          aria-label="Navigasi galeri"
        >
          <button
            type="button"
            aria-label="Foto sebelumnya"
            disabled={index === 0}
            onClick={() => go(index - 1)}
          >
            ←
          </button>
          <span className="gallery-count" aria-live="polite" aria-atomic="true">
            {index + 1} / {items.length}
          </span>
          <div className="gallery-dots">
            {items.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Lihat foto ${i + 1}`}
                aria-current={index === i ? "true" : undefined}
                onClick={() => go(i)}
              >
                <span />
              </button>
            ))}
          </div>
          <button
            type="button"
            aria-label="Foto berikutnya"
            disabled={index === items.length - 1}
            onClick={() => go(index + 1)}
          >
            →
          </button>
        </div>
      )}
    </div>
  );
}
