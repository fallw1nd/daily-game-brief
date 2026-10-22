export function editionsNewestFirst<T extends { id: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => b.id.localeCompare(a.id));
}
