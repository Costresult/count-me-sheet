/** Time this build was made (set by the bundler); lets the user and the voice log tell which version runs. */
declare const __BUILD_TIME__: string;

export const BUILD_TIME: string = typeof __BUILD_TIME__ === "string" ? __BUILD_TIME__ : "dev";

/** "10 Kas 03:44" style label in the user's local time */
export function buildLabel(): string {
  const d = new Date(BUILD_TIME);
  if (Number.isNaN(d.getTime())) return BUILD_TIME;
  return d.toLocaleString("tr-TR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
