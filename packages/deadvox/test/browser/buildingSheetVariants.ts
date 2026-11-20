// Slot variants on the building sheet: the slots a layout's assemblies have, and a seed whose draw shows the chosen
// alternatives. Why: `docs/building-sheet.md`, "Slot variants".

import { buildingSource, layoutBuildingSite, placementOf } from '@skelly/engine/internal/core/authoredPlacement.ts';
import type { Registry } from '@skelly/engine/internal/core/content.ts';
import type { KitRef, MapAssemblyDef, SiteLayoutDef } from '@skelly/engine/internal/core/schema/files.ts';
import { type CompiledTemplate, kitSlotChoices } from '@skelly/engine/internal/core/templates.ts';

/** The alternative wanted, by slot path inside the placed assembly: `roof`, or `house/roof` for a nested slot. */
export type Variants = Readonly<Record<string, string>>;

/** An alternative as `--variant` names it: its id, and its style when the ref names one. */
const choiceName = ({ id, style }: KitRef): string => (style ? `${id}@${style}` : id);

type SlotRegistry = Pick<Registry, 'mapAssemblies' | 'mapPools'>;

/** Every slot path of `assembly`, nested assemblies' slots included, with the alternatives it can draw. */
export const slotAlternatives = (registry: SlotRegistry, assembly: MapAssemblyDef): Map<string, Set<string>> => {
  const slots = new Map<string, Set<string>>();
  const walk = (def: MapAssemblyDef, prefix: string, ancestors: readonly string[]): void => {
    for (const slot of def.slots) {
      const path = prefix ? `${prefix}/${slot.id}` : slot.id;
      const refs = kitSlotChoices(registry as Registry, slot).map(({ ref }) => ref);
      slots.set(path, new Set([...(slots.get(path) ?? []), ...refs.map(choiceName)]));
      for (const nested of nestedAssemblies(registry, refs, ancestors)) {
        walk(nested, path, [...ancestors, nested.id]);
      }
    }
  };
  walk(assembly, '', [assembly.id]);
  return slots;
};

/** The assemblies `refs` name, leaving out any already open above, so a self-nesting kit ends. */
const nestedAssemblies = (registry: SlotRegistry, refs: readonly KitRef[], ancestors: readonly string[]) =>
  refs.flatMap((ref) => {
    const nested = ref.kind === 'assembly' ? registry.mapAssemblies.get(ref.id) : undefined;
    return nested && !ancestors.includes(nested.id) ? [nested] : [];
  });

const listed = (names: Iterable<string>): string => [...names].sort().join(', ') || 'none';

/** The assemblies placed at `indices` of `layout`, by index, with their slots. */
const placedSlots = (registry: Registry, layout: SiteLayoutDef, indices: readonly number[]) =>
  indices.flatMap((index) => {
    const source = buildingSource(registry, layout.buildings[index]!);
    return source?.kind === 'assembly'
      ? [{ index, assembly: source.definition, slots: slotAlternatives(registry, source.definition) }]
      : [];
  });

/** Throws, listing the accepted ones, when no placed assembly has a chosen slot or that slot never draws the choice. */
const checkVariants = (placed: ReturnType<typeof placedSlots>, variants: Variants): void => {
  for (const [slot, choice] of Object.entries(variants)) {
    const having = placed.filter(({ slots }) => slots.has(slot));
    if (having.length === 0) {
      const known = new Set(placed.flatMap(({ slots }) => [...slots.keys()]));
      throw new Error(`No building drawn has a slot "${slot}"; their slots are: ${listed(known)}`);
    }
    const choices = new Set(having.flatMap(({ slots }) => [...slots.get(slot)!]));
    if (!choices.has(choice)) {
      throw new Error(`Slot "${slot}" has no alternative "${choice}"; it draws: ${listed(choices)}`);
    }
  }
};

/** Where a variant search looks: the buildings at `indices` of `layout`, at each of `seeds` in turn. */
export interface VariantSearch {
  readonly layout: SiteLayoutDef;
  readonly indices: readonly number[];
  readonly variants: Variants;
  readonly seeds: readonly number[];
}

/**
 * The first seed at which every searched building that has a chosen slot draws the chosen alternative there, or
 * nothing when none does. An unknown slot or alternative throws, listing the accepted ones.
 */
export const variantSeed = (
  registry: Registry,
  { layout, indices, variants, seeds }: VariantSearch,
): number | undefined => {
  const placed = placedSlots(registry, layout, indices);
  checkVariants(placed, variants);
  const wanted = placed
    .map(({ index, assembly, slots }) => ({
      index,
      // The engine names a slot by its path from the placed assembly's own id.
      draws: Object.entries(variants).flatMap(([slot, choice]) =>
        slots.has(slot) ? [[`${assembly.id}/${slot}`, choice] as const] : [],
      ),
    }))
    .filter(({ draws }) => draws.length > 0);
  const pieceCache = new Map<string, CompiledTemplate>();
  const drawsChosen = (seed: number) =>
    wanted.every(({ index, draws }) => {
      const drawn = new Map<string, string>();
      placementOf(registry, layout.buildings[index]!, layout.lootContext, {
        ...layoutBuildingSite(seed, layout, index),
        pieceCache,
        onDraw: (path, ref) => drawn.set(path, choiceName(ref)),
      });
      return draws.every(([path, choice]) => drawn.get(path) === choice);
    });
  return [...seeds].find(drawsChosen);
};
