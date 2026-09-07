import type { SVGProps } from "react";

/**
 * Small hand-built inline SVG icon set (no external icon library is installed
 * in this app — see apps/web/package.json). Stroke-based, 24x24, inherits
 * `currentColor` so callers control color via className.
 */
export type IconName =
  | "briefcase"
  | "users"
  | "folder"
  | "box"
  | "tag"
  | "percent"
  | "fileText"
  | "cart"
  | "layers"
  | "flask"
  | "database"
  | "clipboard"
  | "checkCircle"
  | "truck"
  | "idCard"
  | "calendar"
  | "package"
  | "store"
  | "wallet"
  | "receipt"
  | "shield"
  | "creditCard"
  | "fileClock"
  | "barChart"
  | "settings"
  | "building"
  | "mapPin"
  | "user"
  | "key"
  | "chevronDown"
  | "chevronRight"
  | "chevronsLeft"
  | "chevronsRight"
  | "menu"
  | "x"
  | "home"
  | "globe"
  | "logOut"
  | "sun"
  | "moon";

const PATHS: Record<IconName, React.ReactNode> = {
  briefcase: (
    <>
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </>
  ),
  users: (
    <>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />,
  box: (
    <>
      <path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" />
      <path d="M3 8l9 5 9-5M12 13v8" />
    </>
  ),
  tag: (
    <>
      <path d="M20 12 12 20a2 2 0 0 1-2.83 0l-6.17-6.17A2 2 0 0 1 2.6 12.3L4 4l8.3-1.4a2 2 0 0 1 1.7.6L20 9.2a2 2 0 0 1 0 2.8Z" />
      <circle cx="8.5" cy="8.5" r="1.5" />
    </>
  ),
  percent: (
    <>
      <line x1="19" y1="5" x2="5" y2="19" />
      <circle cx="6.5" cy="6.5" r="2.5" />
      <circle cx="17.5" cy="17.5" r="2.5" />
    </>
  ),
  fileText: (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6M8 13h8M8 17h8M8 9h2" />
    </>
  ),
  cart: (
    <>
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </>
  ),
  layers: (
    <>
      <path d="m12 2 9 5-9 5-9-5 9-5Z" />
      <path d="m3 12 9 5 9-5M3 17l9 5 9-5" />
    </>
  ),
  flask: (
    <>
      <path d="M9 2v6.5L4 18a2 2 0 0 0 1.8 2.9h12.4A2 2 0 0 0 20 18l-5-9.5V2" />
      <path d="M8 2h8M6.5 15h11" />
    </>
  ),
  database: (
    <>
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
      <path d="M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3" />
    </>
  ),
  clipboard: (
    <>
      <rect x="7" y="3" width="10" height="4" rx="1" />
      <path d="M9 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3" />
      <path d="M9 12h6M9 16h6" />
    </>
  ),
  checkCircle: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  truck: (
    <>
      <rect x="1" y="6" width="14" height="11" rx="1" />
      <path d="M15 10h4l3 3v4h-7z" />
      <circle cx="6" cy="19" r="2" />
      <circle cx="17.5" cy="19" r="2" />
    </>
  ),
  idCard: (
    <>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <circle cx="8" cy="11" r="2" />
      <path d="M5 17c0-1.66 1.34-3 3-3s3 1.34 3 3M14 9h6M14 13h6M14 17h4" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </>
  ),
  package: (
    <>
      <path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" />
      <path d="m3.3 7.6 8.7 4.9 8.7-4.9M12 22.2V12.5" />
    </>
  ),
  store: (
    <>
      <path d="M3 9V4h18v5M4 9l1 11h14l1-11M4 9h16M9 20v-6h6v6" />
    </>
  ),
  wallet: (
    <>
      <path d="M20 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2Z" />
      <path d="M16 7V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v2" />
      <circle cx="16" cy="13" r="1.5" />
    </>
  ),
  receipt: (
    <>
      <path d="M4 2h16v20l-3-2-2 2-3-2-2 2-3-2-3 2V2Z" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </>
  ),
  shield: <path d="M12 2 4 5v6c0 5 3.4 8.7 8 11 4.6-2.3 8-6 8-11V5l-8-3Z" />,
  creditCard: (
    <>
      <rect x="1" y="5" width="22" height="14" rx="2" />
      <path d="M1 10h22" />
    </>
  ),
  fileClock: (
    <>
      <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h9" />
      <path d="M13 2v6h6" />
      <circle cx="16.5" cy="16.5" r="4.5" />
      <path d="M16.5 14.5v2l1.3 1.3" />
    </>
  ),
  barChart: (
    <>
      <line x1="12" y1="20" x2="12" y2="10" />
      <line x1="18" y1="20" x2="18" y2="4" />
      <line x1="6" y1="20" x2="6" y2="16" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </>
  ),
  building: (
    <>
      <rect x="4" y="2" width="16" height="20" rx="1" />
      <path d="M9 6h1M14 6h1M9 10h1M14 10h1M9 14h1M14 14h1M9 18h6" />
    </>
  ),
  mapPin: (
    <>
      <path d="M21 10c0 6-9 12-9 12s-9-6-9-12a9 9 0 0 1 18 0Z" />
      <circle cx="12" cy="10" r="3" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
    </>
  ),
  key: (
    <>
      <circle cx="7.5" cy="15.5" r="5.5" />
      <path d="m21 2-9.6 9.6M15.5 7.5l3 3M18.5 4.5l3 3" />
    </>
  ),
  chevronDown: <polyline points="6 9 12 15 18 9" />,
  chevronRight: <polyline points="9 18 15 12 9 6" />,
  chevronsLeft: (
    <>
      <polyline points="11 17 6 12 11 7" />
      <polyline points="18 17 13 12 18 7" />
    </>
  ),
  chevronsRight: (
    <>
      <polyline points="13 17 18 12 13 7" />
      <polyline points="6 17 11 12 6 7" />
    </>
  ),
  menu: <path d="M3 6h18M3 12h18M3 18h18" />,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  home: <path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2h-4v-8H9v8H5a2 2 0 0 1-2-2V10Z" />,
  globe: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20Z" />
    </>
  ),
  logOut: (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </>
  ),
  moon: <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />,
};

export function Icon({ name, className, ...props }: { name: IconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      {PATHS[name]}
    </svg>
  );
}
