import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Project } from "../project-schema/project";
import { ProjectRenderer } from "../renderer/ProjectRenderer";
import documentStyles from "../styles.css?inline";
import { StudioIcon } from "./StudioIcon";

const devices = {
  desktop: { label: "Desktop", width: 1280, height: 800 },
  tablet: { label: "Tablet", width: 768, height: 1024 },
  mobile: { label: "Mobile", width: 390, height: 844 },
} as const;
type Device = keyof typeof devices;
// Only this fixed shell enters srcDoc. Project content stays in the safe React renderer.
const shell =
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Website preview</title></head><body style="margin:0"></body></html>';

/** A real viewport for media queries; scaling only changes how it fits the workspace. */
export function ResponsivePreview({ project }: { project: Project }) {
  const [device, setDevice] = useState<Device>("desktop");
  const [mount, setMount] = useState<HTMLElement | null>(null);
  const [availableWidth, setAvailableWidth] = useState(0);
  const surface = useRef<HTMLDivElement>(null);
  const preset = devices[device];
  const scale =
    availableWidth > 0 ? Math.min(1, availableWidth / preset.width) : 1;
  useEffect(() => {
    const element = surface.current;
    if (!element) return;
    setAvailableWidth(element.clientWidth);
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setAvailableWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return (
    <section className="preview-stage" aria-label="Website preview">
      <div className="device-preview-toolbar">
        <div>
          <h2>Website preview</h2>
          <p>Check the layout on every screen, before you save.</p>
        </div>
        <div
          className="device-preview-controls"
          role="group"
          aria-label="Preview device"
        >
          {(Object.keys(devices) as Device[]).map((key) => (
            <button
              type="button"
              key={key}
              aria-pressed={device === key}
              onClick={() => setDevice(key)}
            >
              <StudioIcon name={key} />
              {devices[key].label}
            </button>
          ))}
        </div>
      </div>
      <p className="device-preview-caption" role="status" aria-live="polite">
        {preset.label} · {preset.width} × {preset.height} px ·{" "}
        {Math.round(scale * 100)}% zoom
      </p>
      <div className="device-preview-window" data-device={device}>
        <div className="device-preview-browserbar">
          <span className="preview-window-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span className="preview-window-name">{project.name}</span>
          <span className="preview-window-label">Preview only</span>
        </div>
        <div className="device-preview-surface" ref={surface}>
          <div
            className="device-preview-fit"
            style={{
              width: preset.width * scale,
              height: preset.height * scale,
            }}
          >
            <iframe
              className="device-preview-frame"
              title="Website device preview"
              sandbox="allow-same-origin"
              srcDoc={shell}
              width={preset.width}
              height={preset.height}
              style={{
                width: preset.width,
                height: preset.height,
                transform: `scale(${scale})`,
              }}
              onLoad={(event) =>
                setMount(event.currentTarget.contentDocument?.body ?? null)
              }
            />
          </div>
        </div>
      </div>
      {mount &&
        createPortal(
          <>
            <style>{documentStyles}</style>
            <div
              className="site-page"
              style={{
                maxWidth: "none",
                minHeight: "100vh",
                border: 0,
                margin: 0,
                boxShadow: "none",
              }}
              onClickCapture={(event) => {
                // Keep reviewed links from navigating away from the document or workspace.
                const link = (event.target as Element).closest("a");
                if (!link) return;
                event.preventDefault();
                const href = link.getAttribute("href");
                if (href?.startsWith("#"))
                  mount.ownerDocument
                    .getElementById(href.slice(1))
                    ?.scrollIntoView({ block: "start" });
              }}
              onAuxClick={(event) => event.preventDefault()}
            >
              <ProjectRenderer project={project} />
            </div>
          </>,
          mount,
        )}
      <p className="preview-footnote">
        {project.blocks.length} blocks · Scroll inside the preview to see more.
        External links stay inactive while previewing.
        <br />
        Switching devices does not change or save your draft.
      </p>
    </section>
  );
}
