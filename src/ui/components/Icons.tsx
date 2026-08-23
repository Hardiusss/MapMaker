/** Inline icon set — no icon font, no network requests. */
import React from 'react';

type P = { size?: number } & React.SVGProps<SVGSVGElement>;

const Svg = ({ size = 19, children, ...rest }: P & { children: React.ReactNode }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
    strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" {...rest}>
    {children}
  </svg>
);

export const IconCursor = (p: P) => <Svg {...p}><path d="M5 3l7 17 2.4-6.6L21 11z" /></Svg>;
export const IconBrush = (p: P) => <Svg {...p}><path d="M9.5 14.5L3 21s3.5.5 5-1 1.5-4 1.5-4z" /><path d="M11 13l8.5-8.5a2 2 0 0 0-3-3L8 10" /><path d="M9.5 14.5L11 13" /></Svg>;
export const IconEraser = (p: P) => <Svg {...p}><path d="M4 16l6-6 8 8-3 3H8z" /><path d="M10 10l5-5 8 8-5 5" /><path d="M3 21h18" /></Svg>;
export const IconFill = (p: P) => <Svg {...p}><path d="M10 3l9 9-8 8-9-9z" /><path d="M6 7l8 8" /><circle cx="20" cy="18" r="2" /></Svg>;
export const IconStamp = (p: P) => <Svg {...p}><path d="M8 3h8l-1.5 6H9.5z" /><rect x="4" y="9" width="16" height="5" rx="1" /><path d="M4 18h16v3H4z" /></Svg>;
export const IconText = (p: P) => <Svg {...p}><path d="M4 6V4h16v2" /><path d="M12 4v16" /><path d="M8 20h8" /></Svg>;
export const IconShape = (p: P) => <Svg {...p}><rect x="3" y="3" width="10" height="10" rx="1" /><circle cx="16" cy="16" r="5" /></Svg>;
export const IconPath = (p: P) => <Svg {...p}><path d="M3 18c4 0 4-12 9-12s5 12 9 12" /><circle cx="3" cy="18" r="1.6" /><circle cx="21" cy="18" r="1.6" /></Svg>;
export const IconWall = (p: P) => <Svg {...p}><path d="M3 6h18M3 12h18M3 18h18" /><path d="M8 6v6M16 12v6M12 0v6" /></Svg>;
export const IconLight = (p: P) => <Svg {...p}><circle cx="12" cy="10" r="4" /><path d="M12 2v2M12 16v2M4 10H2M22 10h-2M5.6 3.6l1.4 1.4M17 16.4l1.4 1.4M18.4 3.6L17 5M7 16.4L5.6 17.8" /><path d="M9 20h6" /></Svg>;
export const IconNote = (p: P) => <Svg {...p}><path d="M6 3h9l5 5v13H6z" /><path d="M15 3v5h5" /><path d="M9 12h7M9 16h5" /></Svg>;
export const IconToken = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="10" r="2.6" /><path d="M6.8 18a6 6 0 0 1 10.4 0" /></Svg>;
export const IconRuler = (p: P) => <Svg {...p}><rect x="2" y="8" width="20" height="8" rx="1" transform="rotate(-20 12 12)" /><path d="M7 9v2M10 8v3M13 7v2M16 6v3" /></Svg>;
export const IconDropper = (p: P) => <Svg {...p}><path d="M18 2l4 4-9 9-4-4z" /><path d="M9 11l-6 6v4h4l6-6" /></Svg>;
export const IconCastle = (p: P) => <Svg {...p}><path d="M3 21V7l1.5 1.3L6 7l1.5 1.3L9 7v4h6V7l1.5 1.3L18 7l1.5 1.3L21 7v14z" /><path d="M10 21v-4.2a2 2 0 0 1 4 0V21" /></Svg>;
export const IconHand = (p: P) => <Svg {...p}><path d="M8 13V5a1.5 1.5 0 0 1 3 0v6" /><path d="M11 11V4a1.5 1.5 0 0 1 3 0v7" /><path d="M14 11V6a1.5 1.5 0 0 1 3 0v7" /><path d="M17 11a1.5 1.5 0 0 1 3 0v4a6 6 0 0 1-6 6h-2a6 6 0 0 1-6-6v-2l-2-3a1.5 1.5 0 0 1 2.6-1.5L8 13" /></Svg>;

export const IconLayers = (p: P) => <Svg {...p}><path d="M12 3l9 5-9 5-9-5z" /><path d="M3 13l9 5 9-5" /></Svg>;
export const IconEye = (p: P) => <Svg {...p}><path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12z" /><circle cx="12" cy="12" r="2.6" /></Svg>;
export const IconEyeOff = (p: P) => <Svg {...p}><path d="M3 3l18 18" /><path d="M10.6 6.2A9.6 9.6 0 0 1 12 6c6.4 0 10 6 10 6a17 17 0 0 1-3.2 3.7" /><path d="M6.3 8.4A17 17 0 0 0 2 12s3.6 6 10 6a9.5 9.5 0 0 0 3.6-.7" /></Svg>;
export const IconLock = (p: P) => <Svg {...p}><rect x="4" y="10" width="16" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></Svg>;
export const IconPlus = (p: P) => <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>;
export const IconTrash = (p: P) => <Svg {...p}><path d="M4 7h16" /><path d="M9 7V5h6v2" /><path d="M6 7l1 13h10l1-13" /></Svg>;
export const IconCopy = (p: P) => <Svg {...p}><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M4 16V6a2 2 0 0 1 2-2h10" /></Svg>;
export const IconUp = (p: P) => <Svg {...p}><path d="M12 19V5M5 12l7-7 7 7" /></Svg>;
export const IconDown = (p: P) => <Svg {...p}><path d="M12 5v14M5 12l7 7 7-7" /></Svg>;
export const IconMerge = (p: P) => <Svg {...p}><path d="M12 3v8M8 7l4 4 4-4" /><rect x="4" y="15" width="16" height="6" rx="1" /></Svg>;
export const IconGrid = (p: P) => <Svg {...p}><rect x="3" y="3" width="18" height="18" rx="1" /><path d="M9 3v18M15 3v18M3 9h18M3 15h18" /></Svg>;
export const IconWand = (p: P) => <Svg {...p}><path d="M15 4V2M15 22v-2M4.9 4.9L3.5 3.5M20.5 20.5l-1.4-1.4M4 15H2M22 15h-2" /><path d="M13 6l5 5L7 22l-5-5z" /></Svg>;
export const IconExport = (p: P) => <Svg {...p}><path d="M12 3v12" /><path d="M8 7l4-4 4 4" /><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /></Svg>;
export const IconSave = (p: P) => <Svg {...p}><path d="M5 3h11l3 3v15H5z" /><path d="M8 3v6h8V3" /><rect x="8" y="13" width="8" height="8" /></Svg>;
export const IconOpen = (p: P) => <Svg {...p}><path d="M3 7h6l2 2h10v10H3z" /></Svg>;
export const IconNew = (p: P) => <Svg {...p}><path d="M6 3h8l5 5v13H6z" /><path d="M14 3v5h5" /><path d="M12 11v6M9 14h6" /></Svg>;
export const IconUndo = (p: P) => <Svg {...p}><path d="M4 8h11a5 5 0 0 1 0 10h-6" /><path d="M8 4L4 8l4 4" /></Svg>;
export const IconRedo = (p: P) => <Svg {...p}><path d="M20 8H9a5 5 0 0 0 0 10h6" /><path d="M16 4l4 4-4 4" /></Svg>;
export const IconZoomIn = (p: P) => <Svg {...p}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5M11 8v6M8 11h6" /></Svg>;
export const IconZoomOut = (p: P) => <Svg {...p}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5M8 11h6" /></Svg>;
export const IconFit = (p: P) => <Svg {...p}><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></Svg>;
export const IconClose = (p: P) => <Svg {...p}><path d="M6 6l12 12M18 6L6 18" /></Svg>;
export const IconSettings = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1" /></Svg>;
export const IconPanel = (p: P) => <Svg {...p}><rect x="3" y="4" width="18" height="16" rx="1" /><path d="M15 4v16" /></Svg>;
export const IconInfo = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></Svg>;
export const IconSparkle = (p: P) => <Svg {...p}><path d="M12 3l2 5.5L19.5 10 14 12l-2 5.5L10 12 4.5 10 10 8.5z" /></Svg>;
export const IconImage = (p: P) => <Svg {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9.5" r="1.6" /><path d="M4 17l5-5 4 4 3-2 4 4" /></Svg>;
export const IconFolder = (p: P) => <Svg {...p}><path d="M3 6h6l2 2h10v11H3z" /></Svg>;
export const IconBook = (p: P) => <Svg {...p}><path d="M4 4h7a3 3 0 0 1 3 3v13a2.5 2.5 0 0 0-2.5-2.5H4z" /><path d="M20 4h-3a3 3 0 0 0-3 3v13a2.5 2.5 0 0 1 2.5-2.5H20z" /></Svg>;
