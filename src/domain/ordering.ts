export type Direction = "up" | "down";

export function moveItem(ids: readonly string[], id: string, direction: Direction): string[] {
  const result = [...ids];
  const from = result.indexOf(id);
  const to = direction === "up" ? from - 1 : from + 1;
  if (from === -1 || to < 0 || to >= result.length) return result;
  [result[from], result[to]] = [result[to]!, result[from]!];
  return result;
}
