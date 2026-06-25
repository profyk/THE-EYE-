export default function EyeLogo({ size = 36, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" className={`shrink-0 ${className}`}>
      <ellipse cx="18" cy="18" rx="16" ry="10" stroke="var(--accent)" strokeWidth="1.5" />
      <circle cx="18" cy="18" r="5" fill="var(--accent)" fillOpacity="0.15" stroke="var(--accent)" strokeWidth="1.5" />
      <circle cx="18" cy="18" r="2" fill="var(--accent)" />
    </svg>
  );
}
