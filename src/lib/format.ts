export function money(amount: number): string {
  return `RM${new Intl.NumberFormat("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)}`;
}
export function grams(amount: number): string {
  return `${new Intl.NumberFormat("en-MY", { maximumFractionDigits: 3 }).format(amount)} g`;
}
export function machineTime(minutes: number): string {
  const whole = Math.round(minutes);
  return `${Math.floor(whole / 60)}h ${whole % 60}m`;
}
export function dateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-MY", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}
export function downloadFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
