import type { Solid } from './schema.ts';

export interface DisplayItem {
  readonly id: string;
  readonly solids: readonly Solid[];
  readonly merged: boolean;
}

/** Selects the same individual solids and merged groups for viewer, exports, and metrics. */
export const displayItems = (solids: readonly Solid[]): DisplayItem[] => {
  const groups = new Map<string, Solid[]>();
  for (const solid of solids) {
    const group = solid.display?.mergeGroup;
    if (group) {
      groups.set(group, [...(groups.get(group) ?? []), solid]);
    }
  }
  const items: DisplayItem[] = solids
    .filter((solid) => !solid.display?.mergeGroup)
    .map((solid) => ({ id: solid.id, solids: [solid], merged: false }));
  for (const [id, members] of groups) {
    items.push({ id, solids: members, merged: true });
  }
  return items;
};
