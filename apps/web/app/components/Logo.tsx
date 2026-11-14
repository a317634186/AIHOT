// The site's wordmark (its name from industry/site.ts, set in type) and a small ring mark used as the
// loader. A site with its own logo can replace Wordmark here.
import { SITE } from "@aihot/industry/site";

/** Compact retail tag mark; replaces decorative Unicode arrows in the public header. */
export function PriceTagMark({ className = "" }: { className?: string }) {
  return <svg viewBox="0 0 28 28" className={className} aria-hidden="true">
    <path d="M4.2 5.1a1.8 1.8 0 0 1 1.8-1.8h8.1c.48 0 .94.19 1.28.53l8.7 8.7a1.8 1.8 0 0 1 0 2.55l-7.3 7.3a1.8 1.8 0 0 1-2.55 0l-8.7-8.7a1.8 1.8 0 0 1-.53-1.28V6.3c0-.66.54-1.2 1.2-1.2Z" fill="currentColor"/>
    <circle cx="9.4" cy="9.1" r="2.05" fill="#F8FAFC"/>
    <path d="M11.8 18.7 18.7 11.8" stroke="#F8FAFC" strokeWidth="2.2" strokeLinecap="round"/>
    <path d="m16.3 17.2 3.1 3.1" stroke="#F5C469" strokeWidth="2.2" strokeLinecap="round"/>
  </svg>;
}

export function Wordmark({ size = 22, className = "" }: { size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center font-black leading-none tracking-[-0.03em] ${className}`} style={{ fontSize: size }} aria-label={SITE.name} role="img">
      <span aria-hidden="true" className="mr-[0.3em] inline-block size-[0.42em] rounded-full bg-accent" />
      <span aria-hidden="true">{SITE.name}</span>
    </span>
  );
}

/** A ring with a dot; spinning, it is the loader. */
export function RingMark({ className = "", spinning = false }: { className?: string; spinning?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <g style={spinning ? { transformOrigin: "12px 12px", animation: "spin-slow 1.1s linear infinite" } : undefined}>
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeDasharray="42 15" />
      </g>
      <circle cx="12" cy="12" r="2.6" fill="currentColor" />
    </svg>
  );
}
