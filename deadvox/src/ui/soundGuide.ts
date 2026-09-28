import type { Manifest } from '../core/assets.ts';
import type { SoundDef } from '../core/content.ts';
import type { SoundEventId } from '../core/soundEvents.ts';

export interface SoundTriggerGuide {
  readonly trigger: string;
  readonly debugHint?: string;
  readonly note?: string;
}

/** Player-facing order and concrete triggers; sound settings and variants come from sounds.json. */
const TRIGGER_ENTRIES = [
  ['footstep_grass', { trigger: 'Walk, jog, or sprint over grass.' }],
  ['footstep_mud', { trigger: 'Walk, jog, or sprint over dirt or mud.' }],
  [
    'footstep_sand',
    {
      trigger: 'Walk, jog, or sprint over sand.',
      note: 'Stand-in: shares its grass/sand recording set with footstep_grass.',
    },
  ],
  [
    'footstep_stone',
    { trigger: 'Walk, jog, or sprint over a hard surface (stone, concrete, brick, tile, and similar).' },
  ],
  ['footstep_wood', { trigger: 'Walk, jog, or sprint over planks.' }],
  ['footstep_leaves', { trigger: 'Walk, jog, or sprint over fabric or carpet.' }],
  ['door_open', { trigger: 'Press F while looking at a closed, reachable door.' }],
  ['door_close', { trigger: 'Press F while looking at an open, reachable door.' }],
  [
    'door_blocked_close',
    {
      trigger: 'Press F to close a door while something blocks it.',
      note: 'Stand-in: reuses the door_close recordings at a lower configured gain.',
    },
  ],
  ['player_strain', { trigger: 'Press Space while grounded to jump.' }],
  [
    'player_landing_hard',
    {
      trigger: 'Land after dropping at least 2.5 m.',
      debugHint: '?debug=1: Backquote opens the debug panel; P enables noclip for reaching a ledge.',
      note: 'Stand-in: the curated source is a generic jump/landing recording.',
    },
  ],
  [
    'shambler_idle',
    {
      trigger: 'Wait within hearing range while a shambler idles or strolls; it occasionally groans.',
      debugHint: '?debug=1: Backquote → V spawns shamblers nearby.',
    },
  ],
  [
    'shambler_step_grass',
    {
      trigger:
        'Listen near a shambler on grass: grounded travel drives the uneven steps, faster in a chase; only the nearest 3 moving shamblers are voiced.',
      debugHint: '?debug=1: Backquote → V spawns shamblers nearby.',
      note: 'MVP stand-in: player grass/sand CC0 clips pitched down to sound heavier; bespoke shambler foley is future work.',
    },
  ],
  [
    'shambler_step_mud',
    {
      trigger:
        'Listen near a shambler on dirt or mud: grounded travel drives the uneven steps, faster in a chase; only the nearest 3 moving shamblers are voiced.',
      debugHint: '?debug=1: Backquote → V spawns shamblers nearby.',
      note: 'MVP stand-in: player mud CC0 clips pitched down to sound heavier; bespoke shambler foley is future work.',
    },
  ],
  [
    'shambler_step_sand',
    {
      trigger:
        'Listen near a shambler on sand: grounded travel drives the uneven steps, faster in a chase; only the nearest 3 moving shamblers are voiced.',
      debugHint: '?debug=1: Backquote → V spawns shamblers nearby.',
      note: 'MVP stand-in: player grass/sand CC0 clips pitched down to sound heavier; bespoke shambler foley is future work.',
    },
  ],
  [
    'shambler_step_stone',
    {
      trigger:
        'Listen near a shambler on hard ground: grounded travel drives the uneven steps, faster in a chase; only the nearest 3 moving shamblers are voiced.',
      debugHint: '?debug=1: Backquote → V spawns shamblers nearby.',
      note: 'MVP stand-in: player stone CC0 clips pitched down to sound heavier; bespoke shambler foley is future work.',
    },
  ],
  [
    'shambler_step_wood',
    {
      trigger:
        'Listen near a shambler on planks: grounded travel drives the uneven steps, faster in a chase; only the nearest 3 moving shamblers are voiced.',
      debugHint: '?debug=1: Backquote → V spawns shamblers nearby.',
      note: 'MVP stand-in: player wood CC0 clips pitched down to sound heavier; bespoke shambler foley is future work.',
    },
  ],
  [
    'shambler_step_leaves',
    {
      trigger:
        'Listen near a shambler on fabric or carpet: grounded travel drives the uneven steps, faster in a chase; only the nearest 3 moving shamblers are voiced.',
      debugHint: '?debug=1: Backquote → V spawns shamblers nearby.',
      note: 'MVP stand-in: player leaves CC0 clips pitched down to sound heavier; bespoke shambler foley is future work.',
    },
  ],
  [
    'shambler_alert',
    {
      trigger: 'A shambler notices you and starts investigating.',
      debugHint: '?debug=1: Backquote → V spawns shamblers nearby.',
    },
  ],
  [
    'shambler_attack',
    {
      trigger: 'Let a shambler reach you and attack.',
      debugHint: '?debug=1: Backquote → V spawns shamblers nearby.',
    },
  ],
  [
    'shambler_hurt',
    {
      trigger: 'Hit a shambler with a melee attack.',
      debugHint: '?debug=1: Backquote → V spawns shamblers nearby.',
    },
  ],
  ['player_hurt_light', { trigger: 'Take 1–14 points of damage.' }],
  [
    'player_hurt_heavy',
    {
      trigger: 'Take 15 or more points of damage.',
      debugHint: '?debug=1: Backquote → K applies 25 damage.',
    },
  ],
  ['melee_swing', { trigger: 'Click the primary mouse button to swing while able to attack.' }],
  ['melee_hit', { trigger: 'Land a melee swing on a shambler.' }],
] satisfies readonly (readonly [SoundEventId, SoundTriggerGuide])[];

export const SOUND_TRIGGER_GUIDE = Object.fromEntries(TRIGGER_ENTRIES) as Record<SoundEventId, SoundTriggerGuide>;
const ORDER = TRIGGER_ENTRIES.map(([id]) => id);

export interface SoundVariantGuide {
  readonly file: string;
  readonly sourcePack: string;
  readonly author: string;
  readonly licence: string;
  readonly sourceUrl: string | null;
}

export interface SoundGuideEntry {
  readonly id: SoundEventId;
  readonly category: SoundDef['category'];
  readonly trigger: string;
  readonly debugHint: string | null;
  readonly gain: number;
  readonly pitchJitter: readonly [number, number];
  readonly gainJitter: readonly [number, number];
  readonly minIntervalSeconds: number;
  readonly noiseRadiusMetres: number | null;
  readonly note: string | null;
  readonly variants: readonly SoundVariantGuide[];
}

/** Joins the live sound definitions to their source/author/licence rows in the asset manifest. */
export const buildSoundGuide = (sounds: readonly SoundDef[], manifest: Manifest): SoundGuideEntry[] => {
  const byFile = new Map(manifest.sources.flatMap((source) => source.files.map((file) => [file, source] as const)));
  const definitions = new Map(sounds.map((sound) => [sound.id, sound]));
  return ORDER.flatMap((id) => {
    const sound = definitions.get(id);
    if (!sound) {
      return [];
    }
    const trigger: SoundTriggerGuide = SOUND_TRIGGER_GUIDE[id];
    return [
      {
        id,
        category: sound.category,
        trigger: trigger.trigger,
        debugHint: trigger.debugHint ?? null,
        gain: sound.gain,
        pitchJitter: sound.pitchJitter,
        gainJitter: sound.gainJitter,
        minIntervalSeconds: sound.minIntervalSeconds,
        noiseRadiusMetres: sound.noise.enabled ? sound.noise.radiusMetres : null,
        note: trigger.note ?? null,
        variants: sound.variants.map((file) => {
          const source = byFile.get(file);
          return {
            file,
            sourcePack: source?.title ?? 'Missing source in assets/manifest.json',
            author: source?.author ?? 'Uncredited',
            licence: source?.licence ?? 'Unknown licence',
            sourceUrl: source?.url ?? null,
          };
        }),
      },
    ];
  });
};
