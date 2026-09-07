export function macro(value?: number | null, suffix = "g") {
  if (value === null || value === undefined) return "-";
  return `${Math.round(value)}${suffix}`;
}


export function nutrientAmount(value?: number | null, unit?: string | null) {
  if (value === null || value === undefined) return "-";
  const rounded = Math.abs(value) >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded}${unit || ""}`;
}

export function minutes(value?: number | null) {
  if (!value) return "-";
  if (value < 60) return `${value} min`;
  const hours = Math.floor(value / 60);
  const mins = value % 60;
  return mins ? `${hours}h ${mins}m` : `${hours}h`;
}

export function dateTime(value?: Date | string | null) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

export function titleCase(value: string) {
  return value.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
