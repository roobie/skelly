import { labelForAction } from '../game/inputBindings.ts';

// The debug panel's groups, their open/closed state, and the catalogue of keys and URL parameters.
//
// Binding labels resolve through the registry so collapsing a group cannot preserve a stale shortcut.

export type GroupId =
  | 'tools'
  | 'survival'
  | 'shamblers'
  | 'time'
  | 'look'
  | 'weathering'
  | 'post'
  | 'lighting'
  | 'atmosphere'
  | 'diagnostics'
  | 'share';

/** A control or readout in a group that is not a key action: documented in the catalogue only. */
interface GroupNote {
  readonly label: string;
  /** Shown in the key column; absent for something with no key. */
  readonly key?: string;
  readonly param?: string;
}

export interface GroupDef {
  readonly id: GroupId;
  readonly title: string;
  /** Shown in the header in place of the keys, for a group with no key actions. */
  readonly hint?: string;
  readonly notes?: readonly GroupNote[];
}

/** The panel's groups, in order. */
export const DEBUG_GROUPS: readonly GroupDef[] = [
  { id: 'tools', title: 'Tools' },
  { id: 'survival', title: 'Survival' },
  { id: 'shamblers', title: 'Zombies' },
  { id: 'time', title: 'Time' },
  {
    id: 'look',
    title: 'Look',
    notes: [
      { label: 'Projected camouflage (debug URL override)', param: 'camofast=1' },
      { label: 'Cached surface noise (debug URL override)', param: 'surfacenoise=1' },
    ],
  },
  {
    id: 'weathering',
    title: 'Weathering',
    notes: [
      { label: 'Profile', param: 'weatheringProfile' },
      { label: 'Strength', param: 'weathering' },
      { label: 'Tint darkness', param: 'weatheringTint' },
      { label: 'Tint colour', param: 'weatheringTintColor' },
      { label: 'Streak strength', param: 'weatheringStreaks' },
      { label: 'Streak length', param: 'weatheringStreakLength' },
      { label: 'Streak colour', param: 'weatheringStreakColor' },
      { label: 'Moss amount', param: 'weatheringMoss' },
      { label: 'Moss colour', param: 'weatheringMossColor' },
      { label: 'Patch size', param: 'weatheringScale' },
      { label: 'Patch variation', param: 'weatheringVariation' },
      { label: 'Moss threshold', param: 'weatheringMossThreshold' },
      { label: 'Moss shelter bias', param: 'weatheringMossBias' },
      { label: 'Mix ceiling', param: 'weatheringMixCeiling' },
      { label: 'Weathering blend', param: 'weatheringBlend' },
      { label: 'Coarser moss patches (debug URL override)', param: 'weathercoarse=1' },
    ],
  },
  {
    id: 'post',
    title: 'Post-processing',
    notes: [
      { label: 'Scene scale (debug URL override)', param: 'renderscale' },
      { label: 'Bloom-chain scale (debug URL override)', param: 'bloomscale' },
      { label: 'Painkiller vignette (debug URL override)', param: 'drugvignette' },
    ],
  },
  {
    id: 'lighting',
    title: 'Lighting',
    notes: [{ label: 'Smaller sun map (debug URL override)', param: 'sunsmall=1' }],
  },
  { id: 'atmosphere', title: 'Atmosphere' },
  {
    id: 'diagnostics',
    title: 'Diagnostics',
    notes: [
      { label: 'Mouse readout (bottom left, always on)' },
      {
        label: 'Performance overlay',
        get key() {
          return labelForAction('debug.performance-toggle');
        },
      },
      { label: 'Interaction ray', param: 'interactionray=1' },
    ],
  },
  {
    id: 'share',
    title: 'Share',
    hint: 'address bar · JSON',
    notes: [
      { label: 'Camera pose, kept in the address bar', param: 'cam=x,y,z,yaw,pitch,roll' },
      { label: 'Dump look settings (JSON), a button' },
    ],
  },
];

/** The part of an action the grouping needs. */
export interface GroupedAction {
  readonly key: string;
  readonly label: string;
  readonly group: GroupId;
  /** The URL parameter this action reads and writes, with a hint of its values (`post=0`, `grade=0..1`). */
  readonly param?: string;
}

/** The actions of each group, in the table's order; every group is listed, a group with no action with an empty list. */
export const actionsByGroup = <T extends { readonly group: GroupId }>(
  actions: readonly T[],
): { def: GroupDef; actions: T[] }[] =>
  DEBUG_GROUPS.map((def) => ({ def, actions: actions.filter((action) => action.group === def.id) }));

/** What a group header shows: its keys, or its hint when it has none. */
export const keysAtAGlance = (def: GroupDef, actions: readonly { readonly key: string }[]): string => {
  const keys = actions.map((action) => action.key).filter(Boolean);
  return keys.length > 0 ? keys.join(' · ') : (def.hint ?? '');
};

/** The bare parameter name of a `name=values` hint. */
export const paramName = (param: string): string => param.split('=')[0]!;

const STORAGE_KEY = 'deadvox.debug-groups-closed';

export type GroupStorage = Pick<Storage, 'getItem' | 'setItem'>;

const KNOWN_IDS = new Set<string>(DEBUG_GROUPS.map((def) => def.id));

/** The groups the operator collapsed in this browser; none (all open) when nothing is stored or storage fails. */
export const readClosedGroups = (storage?: GroupStorage): Set<GroupId> => {
  try {
    const text = (storage ?? globalThis.localStorage)?.getItem(STORAGE_KEY);
    const parsed: unknown = text ? JSON.parse(text) : [];
    if (!Array.isArray(parsed)) {
      return new Set();
    }
    return new Set(parsed.filter((id): id is GroupId => typeof id === 'string' && KNOWN_IDS.has(id)));
  } catch {
    return new Set();
  }
};

/** Remembers the collapsed groups, in the order of the panel; a storage failure is ignored (the state then lasts the session). */
export const writeClosedGroups = (closed: ReadonlySet<GroupId>, storage?: GroupStorage): void => {
  try {
    const ids = DEBUG_GROUPS.map((def) => def.id).filter((id) => closed.has(id));
    (storage ?? globalThis.localStorage)?.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Storage can be unavailable in private or sandboxed contexts.
  }
};
