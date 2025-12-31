import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getBusinessUnitBadgeClass(businessUnit: string) {
  const bu = (businessUnit || "").trim();

  const palette = [
    "bg-red-400/10 text-red-700 border-red-400/20",
    "bg-orange-400/10 text-orange-700 border-orange-400/20",
    "bg-yellow-400/10 text-yellow-800 border-yellow-400/20",
    "bg-emerald-400/10 text-emerald-700 border-emerald-400/20",
    "bg-blue-400/10 text-blue-700 border-blue-400/20",
    "bg-purple-400/10 text-purple-700 border-purple-400/20",
  ];

  let hash = 0;
  for (let i = 0; i < bu.length; i++) {
    hash = Math.imul(31, hash) + bu.charCodeAt(i);
  }
  const idx = bu.length > 0 ? Math.abs(hash) % palette.length : 0;
  return bu.length > 0 ? palette[idx] : "bg-muted text-muted-foreground border-muted-foreground/20";
}
