import type { JSX } from "@solidjs/web";
import { omit } from "solid-js";

// Lucide geometry (lucide-static v1.41.0, ISC), hand-vendored as Solid
// components. `lucide-solid` still declares a `solid-js@^1` peer and imports
// the Solid 1 JSX runtime plus `splitProps`/`mergeProps`, none of which exist
// under Solid 2. Export names mirror `lucide-solid` so call sites only swap the
// import specifier. Add an icon by copying its `<svg>` children from
// https://lucide.dev (24x24 grid, stroke-based).

export interface IconProps extends JSX.SvgSVGAttributes<SVGSVGElement> {
  size?: number | string;
}

function IconBase(props: IconProps & { children: JSX.Element }) {
  const rest = omit(props, "children", "size");
  return (
    <svg
      aria-hidden={props["aria-label"] ? undefined : "true"}
      fill="none"
      height={props.size ?? 24}
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
      viewBox="0 0 24 24"
      width={props.size ?? 24}
      {...rest}
    >
      {props.children}
    </svg>
  );
}

export function Activity(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2" />
    </IconBase>
  );
}

export function AlertTriangle(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </IconBase>
  );
}

export function Archive(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect width="20" height="5" x="2" y="3" rx="1" />
      <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
      <path d="M10 12h4" />
    </IconBase>
  );
}

export function ArrowRight(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </IconBase>
  );
}

export function Ban(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M4.929 4.929 19.07 19.071" />
    </IconBase>
  );
}

export function Brain(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 18V5" />
      <path d="M15 13a4.17 4.17 0 0 1-3-4 4.17 4.17 0 0 1-3 4" />
      <path d="M17.598 6.5A3 3 0 1 0 12 5a3 3 0 1 0-5.598 1.5" />
      <path d="M17.997 5.125a4 4 0 0 1 2.526 5.77" />
      <path d="M18 18a4 4 0 0 0 2-7.464" />
      <path d="M19.967 17.483A4 4 0 1 1 12 18a4 4 0 1 1-7.967-.517" />
      <path d="M6 18a4 4 0 0 1-2-7.464" />
      <path d="M6.003 5.125a4 4 0 0 0-2.526 5.77" />
    </IconBase>
  );
}

export function BookOpen(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 5v16" />
      <path d="M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z" />
    </IconBase>
  );
}

export function Box(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </IconBase>
  );
}

export function Boxes(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v-5.5l-5-3-4.03 2.42Z" />
      <path d="m7 16.5-4.74-2.85" />
      <path d="m7 16.5 5-3" />
      <path d="M7 16.5v5.17" />
      <path d="M12 13.5V19l3.97 2.38a2 2 0 0 0 2.06 0l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71L17 10.5l-5 3Z" />
      <path d="m17 16.5-5-3" />
      <path d="m17 16.5 4.74-2.85" />
      <path d="M17 16.5v5.17" />
      <path d="M7.97 4.42A2 2 0 0 0 7 6.13v4.37l5 3 5-3V6.13a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0l-3 1.8Z" />
      <path d="M12 8 7.26 5.15" />
      <path d="m12 8 4.74-2.85" />
      <path d="M12 13.5V8" />
    </IconBase>
  );
}

export function Cable(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M17 19a1 1 0 0 1-1-1v-2a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2a1 1 0 0 1-1 1z" />
      <path d="M17 21v-2" />
      <path d="M19 14V6.5a1 1 0 0 0-7 0v11a1 1 0 0 1-7 0V10" />
      <path d="M21 21v-2" />
      <path d="M3 5V3" />
      <path d="M4 10a2 2 0 0 1-2-2V6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2a2 2 0 0 1-2 2z" />
      <path d="M7 5V3" />
    </IconBase>
  );
}

export function Calendar(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M8 2v3" />
      <path d="M16 2v3" />
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18" />
    </IconBase>
  );
}

export function Check(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M20 6 9 17l-5-5" />
    </IconBase>
  );
}

export function CheckCircle2(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="m16 9-5.5 5.5L8 12" />
    </IconBase>
  );
}

export function ChevronDown(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m6 9 6 6 6-6" />
    </IconBase>
  );
}

export function ChevronUp(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m18 15-6-6-6 6" />
    </IconBase>
  );
}

export function ChevronsUpDown(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m7 15 5 5 5-5" />
      <path d="m7 9 5-5 5 5" />
    </IconBase>
  );
}

export function GripVertical(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="9" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="9" cy="5" r="1" fill="currentColor" stroke="none" />
      <circle cx="9" cy="19" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="5" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="19" r="1" fill="currentColor" stroke="none" />
    </IconBase>
  );
}

export function Trash2(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
      <line x1="10" x2="10" y1="11" y2="17" />
      <line x1="14" x2="14" y1="11" y2="17" />
    </IconBase>
  );
}

export function ArrowDownUp(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m3 16 4 4 4-4" />
      <path d="M7 20V4" />
      <path d="m21 8-4-4-4 4" />
      <path d="M17 4v16" />
    </IconBase>
  );
}

export function PlusCircle(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M8 12h8" />
      <path d="M12 8v8" />
    </IconBase>
  );
}

export function Filter(props: IconProps) {
  return (
    <IconBase {...props}>
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </IconBase>
  );
}

export function ChevronLeft(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m15 18-6-6 6-6" />
    </IconBase>
  );
}

export function ChevronRight(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m9 18 6-6-6-6" />
    </IconBase>
  );
}

export function ChevronsLeft(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m11 17-5-5 5-5" />
      <path d="m18 17-5-5 5-5" />
    </IconBase>
  );
}

export function ChevronsRight(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m6 17 5-5-5-5" />
      <path d="m13 17 5-5-5-5" />
    </IconBase>
  );
}

export function CircleHelp(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <path d="M12 17h.01" />
    </IconBase>
  );
}

export function Clock(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </IconBase>
  );
}

export function Clock3(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6h4" />
    </IconBase>
  );
}

export function Copy(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </IconBase>
  );
}

export function CornerDownLeft(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M20 4v7a4 4 0 0 1-4 4H4" />
      <path d="m9 10-5 5 5 5" />
    </IconBase>
  );
}

export function Database(props: IconProps) {
  return (
    <IconBase {...props}>
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5V19A9 3 0 0 0 21 19V5" />
      <path d="M3 12A9 3 0 0 0 21 12" />
    </IconBase>
  );
}

export function Eye(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
      <circle cx="12" cy="12" r="3" />
    </IconBase>
  );
}

export function EyeOff(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" />
      <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" />
      <path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" />
      <path d="m2 2 20 20" />
    </IconBase>
  );
}

export function FileText(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" />
      <path d="M14 2v5a1 1 0 0 0 1 1h5" />
      <path d="M10 9H8" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
    </IconBase>
  );
}

export function Folder(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </IconBase>
  );
}

export function FolderOpen(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2" />
    </IconBase>
  );
}

export function Globe(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
      <path d="M2 12h20" />
    </IconBase>
  );
}

export function Hash(props: IconProps) {
  return (
    <IconBase {...props}>
      <line x1="4" x2="20" y1="9" y2="9" />
      <line x1="4" x2="20" y1="15" y2="15" />
      <line x1="10" x2="8" y1="3" y2="21" />
      <line x1="16" x2="14" y1="3" y2="21" />
    </IconBase>
  );
}

export function History(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l4 2" />
    </IconBase>
  );
}

export function Ellipsis(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
      <circle cx="5" cy="12" r="1" />
    </IconBase>
  );
}

export function KeyRound(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z" />
      <circle cx="16.5" cy="7.5" r=".5" fill="currentColor" />
    </IconBase>
  );
}

export function Mail(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </IconBase>
  );
}

export function Layers(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z" />
      <path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12" />
      <path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17" />
    </IconBase>
  );
}

export function LayoutGrid(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect width="7" height="7" x="3" y="3" rx="1" />
      <rect width="7" height="7" x="14" y="3" rx="1" />
      <rect width="7" height="7" x="14" y="14" rx="1" />
      <rect width="7" height="7" x="3" y="14" rx="1" />
    </IconBase>
  );
}

export function Link2(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M9 17H7A5 5 0 0 1 7 7h2" />
      <path d="M15 7h2a5 5 0 1 1 0 10h-2" />
      <line x1="8" x2="16" y1="12" y2="12" />
    </IconBase>
  );
}

export function List(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M3 5h.01" />
      <path d="M3 12h.01" />
      <path d="M3 19h.01" />
      <path d="M8 5h13" />
      <path d="M8 12h13" />
      <path d="M8 19h13" />
    </IconBase>
  );
}

export function Loader2(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </IconBase>
  );
}

export function Lock(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </IconBase>
  );
}

export function LogOut(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    </IconBase>
  );
}

export function Menu(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M4 5h16" />
      <path d="M4 12h16" />
      <path d="M4 19h16" />
    </IconBase>
  );
}

export function Moon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401" />
    </IconBase>
  );
}

export function PanelLeft(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M9 3v18" />
    </IconBase>
  );
}

export function Pencil(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
      <path d="m15 5 4 4" />
    </IconBase>
  );
}

export function PencilLine(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M13 21h8" />
      <path d="m15 5 4 4" />
      <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
    </IconBase>
  );
}

export function Plus(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </IconBase>
  );
}

export function RefreshCw(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 16H3v5" />
    </IconBase>
  );
}

export function Repeat2(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m2 9 3-3 3 3" />
      <path d="M13 18H7a2 2 0 0 1-2-2V6" />
      <path d="m22 15-3 3-3-3" />
      <path d="M11 6h6a2 2 0 0 1 2 2v10" />
    </IconBase>
  );
}

export function Rows3(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M21 9H3" />
      <path d="M21 15H3" />
    </IconBase>
  );
}

export function Search(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m21 21-4.34-4.34" />
      <circle cx="11" cy="11" r="8" />
    </IconBase>
  );
}

export function Settings2(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M14 17H5" />
      <path d="M19 7h-9" />
      <circle cx="17" cy="17" r="3" />
      <circle cx="7" cy="7" r="3" />
    </IconBase>
  );
}

export function ShieldCheck(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <path d="m9 12 2 2 4-4" />
    </IconBase>
  );
}

export function Sun(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </IconBase>
  );
}

export function Tag(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" />
      <circle cx="7.5" cy="7.5" r=".5" fill="currentColor" />
    </IconBase>
  );
}

export function Type(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 4v16" />
      <path d="M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2" />
      <path d="M9 20h6" />
    </IconBase>
  );
}

export function User(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </IconBase>
  );
}

export function Users(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <path d="M16 3.128a4 4 0 0 1 0 7.744" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <circle cx="9" cy="7" r="4" />
    </IconBase>
  );
}

export function Waypoints(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m10.586 5.414-5.172 5.172" />
      <path d="m18.586 13.414-5.172 5.172" />
      <path d="M6 12h12" />
      <circle cx="12" cy="20" r="2" />
      <circle cx="12" cy="4" r="2" />
      <circle cx="20" cy="12" r="2" />
      <circle cx="4" cy="12" r="2" />
    </IconBase>
  );
}

export function X(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </IconBase>
  );
}
