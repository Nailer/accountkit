/**
 * A handful of 20px line icons, drawn inline (no icon dependency).
 * All use currentColor and are hidden from screen readers; the text next to
 * them carries the meaning.
 */
import type { ReactNode, SVGProps } from "react";

function Svg({ children, ...p }: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...p}
    >
      {children}
    </svg>
  );
}

export const WalletIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    <path d="M21 9h-6a3 3 0 0 0 0 6h6z" />
    <circle cx="15.5" cy="12" r=".6" fill="currentColor" />
  </Svg>
);

export const SearchIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Svg>
);

export const ShieldCheckIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M12 3 4.5 6v6c0 4.4 3.2 7.9 7.5 9 4.3-1.1 7.5-4.6 7.5-9V6z" />
    <path d="m9 12 2 2 4-4" />
  </Svg>
);

export const KeyIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <circle cx="8" cy="15" r="4" />
    <path d="m10.8 12.2 8.7-8.7M17 6l2.5 2.5M14.5 8.5 16.5 10.5" />
  </Svg>
);

export const DoorIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M4 21h16M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17" />
    <circle cx="14.5" cy="12.5" r=".8" fill="currentColor" />
  </Svg>
);

export const ArrowRightIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Svg>
);

export const SwapIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M4 8h13l-3-3M20 16H7l3 3" />
  </Svg>
);

export const RefreshIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16M20 20v-4h-4" />
  </Svg>
);

export const AlertIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5.5M12 16.5v.01" />
  </Svg>
);

export const CheckIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Svg>
);

export const XIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);

export const LogOutIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11" />
  </Svg>
);

export const ExternalIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p} width="14" height="14">
    <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </Svg>
);

export const BotIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <rect x="4" y="8" width="16" height="12" rx="3" />
    <path d="M12 4v4M9 13v1M15 13v1M9.5 17h5" />
  </Svg>
);

export const PlusIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const MenuIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M4 7h16M4 12h16M4 17h10" />
  </Svg>
);

export const CopyIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p} width="15" height="15">
    <rect x="8" y="8" width="12" height="12" rx="2.5" />
    <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
  </Svg>
);

export const PlayIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M7 5.5v13a1 1 0 0 0 1.5.86l10.6-6.5a1 1 0 0 0 0-1.72L8.5 4.64A1 1 0 0 0 7 5.5z" />
  </Svg>
);

export const CodeIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="m8 7-5 5 5 5M16 7l5 5-5 5M13.5 4l-3 16" />
  </Svg>
);

export const LayersIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="m12 3 9 5-9 5-9-5 9-5zM3 13l9 5 9-5" />
  </Svg>
);

export const SignatureIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M3 17c3 0 4-6 6-6s1 6 3 6 3-3 4-3 1.5 3 5 3M3 21h18" />
  </Svg>
);

export const ClockIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Svg>
);

/** AccountKit mark: a rounded account tile with a key notch. */
/**
 * The AccountKit mark: an account (rounded square) bound to a token (circle).
 * The token overlaps the account's corner: the NFT and the account are one thing.
 * Same geometry as brand/accountkit-mark.svg.
 */
export const KitMark = ({ size = 28 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    <rect x="0.75" y="0.75" width="62.5" height="62.5" rx="15" fill="var(--ink-800)" stroke="var(--ink-line-2)" strokeWidth="1.5" />
    <rect x="13" y="21" width="30" height="30" rx="8.5" fill="none" stroke="var(--signal)" strokeWidth="5.5" />
    <circle cx="43" cy="21" r="13.6" fill="var(--ink-800)" />
    <circle cx="43" cy="21" r="10.4" fill="var(--signal)" />
  </svg>
);

/** The Clubhouse mark: a doorway inside a rounded square. */
export const ClubMark = () => (
  <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true" focusable="false">
    <rect x="1" y="1" width="26" height="26" rx="8" fill="var(--signal)" />
    <path d="M9 21V9.5a1.5 1.5 0 0 1 1.5-1.5h7a1.5 1.5 0 0 1 1.5 1.5V21" fill="none" stroke="var(--signal-ink)" strokeWidth="2" strokeLinecap="round" />
    <circle cx="16" cy="15" r="1.1" fill="var(--signal-ink)" />
  </svg>
);
