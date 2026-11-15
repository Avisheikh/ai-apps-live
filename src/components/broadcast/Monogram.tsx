import React from "react";

interface MonogramProps {
  name: string;
  slug?: string | null;
  size?: number;
}

export function Monogram({ name, slug, size = 36 }: MonogramProps) {
  // Deterministic 2-letter monogram
  const parts = name.trim().split(/\s+/);
  let initials = "";
  if (parts.length >= 2) {
    initials = (parts[0][0] + parts[1][0]).toUpperCase();
  } else {
    initials = name.slice(0, 2).toUpperCase();
  }

  // Deterministic background hue from slug/name string
  const str = slug || name;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);

  return (
    <div
      style={{
        width: `${size}px`,
        height: `${size}px`,
        backgroundColor: `hsl(${hue}, 45%, 18%)`,
        borderColor: `hsl(${hue}, 60%, 35%)`,
      }}
      className="rounded flex items-center justify-center font-mono font-bold text-broadcast-text border select-none shrink-0"
    >
      <span style={{ fontSize: `${Math.round(size * 0.42)}px` }}>{initials}</span>
    </div>
  );
}
