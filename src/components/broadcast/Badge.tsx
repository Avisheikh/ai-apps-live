import React from "react";
import { DisplayStatus } from "@/lib/status/derive";

interface BadgeProps {
  status: DisplayStatus;
  className?: string;
}

export function StatusBadge({ status, className = "" }: BadgeProps) {
  let bg = "bg-broadcast-gray/20";
  let text = "text-broadcast-gray";
  let border = "border-broadcast-gray/40";
  let label: string = status;

  switch (status) {
    case "VERIFIED":
      bg = "bg-broadcast-green/20";
      text = "text-broadcast-green";
      border = "border-broadcast-green/40";
      label = "VERIFIED";
      break;
    case "SOURCE_DATA":
      bg = "bg-broadcast-blue/20";
      text = "text-broadcast-blue";
      border = "border-broadcast-blue/40";
      label = "SOURCE DATA";
      break;
    case "MANUAL_IMPORT":
      bg = "bg-broadcast-purple/20";
      text = "text-broadcast-purple";
      border = "border-broadcast-purple/40";
      label = "MANUAL IMPORT";
      break;
    case "STALE":
      bg = "bg-broadcast-amber/20";
      text = "text-broadcast-amber";
      border = "border-broadcast-amber/40";
      label = "STALE";
      break;
    case "UNAVAILABLE":
    default:
      bg = "bg-broadcast-gray/20";
      text = "text-broadcast-gray";
      border = "border-broadcast-gray/40";
      label = "UNAVAILABLE";
      break;
  }

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider uppercase border ${bg} ${text} ${border} ${className}`}
    >
      {label}
    </span>
  );
}
