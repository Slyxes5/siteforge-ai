type IconName =
  | "sparkles"
  | "chat"
  | "folder"
  | "reload"
  | "preview"
  | "save"
  | "desktop"
  | "tablet"
  | "mobile"
  | "edit"
  | "layout";

const paths: Record<IconName, string> = {
  sparkles:
    "m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3ZM20 2v4m-2-2h4",
  chat: "M20 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-2 2V11.5a8.5 8.5 0 0 1 17 0ZM7 9h7M7 13h5",
  folder:
    "M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7ZM3 9h18",
  reload: "M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 14 6M4 12a8 8 0 0 0 14 6",
  preview:
    "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  save: "M5 3h12l4 4v14H3V3h2ZM7 3v6h10V3M7 21v-7h10v7",
  desktop: "M3 3h18v13H3V3ZM12 16v5m-5 0h10",
  tablet: "M5 2h14v20H5V2ZM11 18h2",
  mobile: "M7 2h10v20H7V2ZM11 18h2",
  edit: "m15 5 4 4M4 20l4-1L21 6l-4-4L4 15v5Z",
  layout: "M3 3h18v18H3V3ZM3 9h18M10 9v12",
};

export function StudioIcon({ name }: { name: IconName }) {
  return (
    <svg
      className="studio-icon"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={paths[name]} />
    </svg>
  );
}
