import { html } from 'lit-html';
import type { Manifest } from '../core/assets.ts';
import type { SoundDef } from '../core/content.ts';
import type { SoundEventId } from '../core/soundEvents.ts';
import { HEARTBEAT_FILES, HEARTBEAT_TUNING, heartbeatForStamina } from '../game/audioPresentation.ts';

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
  ['door_roller_open', { trigger: 'Open a workshop roller door with F while it is closed.' }],
  [
    'door_close',
    {
      trigger: 'Press F while looking at an open, reachable door.',
      note: 'Temporary BR-approved stand-in; shares its recording with door_blocked_close.',
    },
  ],
  [
    'door_blocked_close',
    {
      trigger: 'Press F to close a door while something blocks it.',
      note: 'Temporary stand-in: shares the door-close recording; a distinct stuck-door sound is future work.',
    },
  ],
  [
    'lock_pry',
    {
      trigger: 'Strike a locked door with a crowbar to force its padlock.',
      note: 'Temporary stand-in: shares the door-blocked recording.',
    },
  ],
  ['player_strain', { trigger: 'Press Space while grounded to jump.' }],
  [
    'player_landing_hard',
    {
      trigger: 'Land after dropping at least 2.5 m.',
      debugHint: "?debug=1: Use the debug panel's Noclip action to reach a ledge.",
      note: 'Stand-in: the curated source is a generic jump/landing recording.',
    },
  ],
  [
    'shambler_idle',
    {
      trigger: 'Wait within hearing range while a shambler idles or strolls; it occasionally groans.',
      debugHint: "?debug=1: Use the debug panel's spawn action to spawn shamblers nearby.",
    },
  ],
  [
    'shambler_step_grass',
    {
      trigger:
        'Listen near a shambler on grass: grounded travel drives the uneven steps, faster in a chase; only the nearest 3 moving shamblers are voiced.',
      debugHint: "?debug=1: Use the debug panel's spawn action to spawn shamblers nearby.",
      note: 'MVP stand-in: player grass/sand CC0 clips pitched down to sound heavier; bespoke shambler foley is future work.',
    },
  ],
  [
    'shambler_step_mud',
    {
      trigger:
        'Listen near a shambler on dirt or mud: grounded travel drives the uneven steps, faster in a chase; only the nearest 3 moving shamblers are voiced.',
      debugHint: "?debug=1: Use the debug panel's spawn action to spawn shamblers nearby.",
      note: 'MVP stand-in: player mud CC0 clips pitched down to sound heavier; bespoke shambler foley is future work.',
    },
  ],
  [
    'shambler_step_sand',
    {
      trigger:
        'Listen near a shambler on sand: grounded travel drives the uneven steps, faster in a chase; only the nearest 3 moving shamblers are voiced.',
      debugHint: "?debug=1: Use the debug panel's spawn action to spawn shamblers nearby.",
      note: 'MVP stand-in: player grass/sand CC0 clips pitched down to sound heavier; bespoke shambler foley is future work.',
    },
  ],
  [
    'shambler_step_stone',
    {
      trigger:
        'Listen near a shambler on hard ground: grounded travel drives the uneven steps, faster in a chase; only the nearest 3 moving shamblers are voiced.',
      debugHint: "?debug=1: Use the debug panel's spawn action to spawn shamblers nearby.",
      note: 'MVP stand-in: player stone CC0 clips pitched down to sound heavier; bespoke shambler foley is future work.',
    },
  ],
  [
    'shambler_step_wood',
    {
      trigger:
        'Listen near a shambler on planks: grounded travel drives the uneven steps, faster in a chase; only the nearest 3 moving shamblers are voiced.',
      debugHint: "?debug=1: Use the debug panel's spawn action to spawn shamblers nearby.",
      note: 'MVP stand-in: player wood CC0 clips pitched down to sound heavier; bespoke shambler foley is future work.',
    },
  ],
  [
    'shambler_step_leaves',
    {
      trigger:
        'Listen near a shambler on fabric or carpet: grounded travel drives the uneven steps, faster in a chase; only the nearest 3 moving shamblers are voiced.',
      debugHint: "?debug=1: Use the debug panel's spawn action to spawn shamblers nearby.",
      note: 'MVP stand-in: player leaves CC0 clips pitched down to sound heavier; bespoke shambler foley is future work.',
    },
  ],
  [
    'shambler_alert',
    {
      trigger: 'A shambler notices you and starts investigating.',
      debugHint: "?debug=1: Use the debug panel's spawn action to spawn shamblers nearby.",
    },
  ],
  [
    'shambler_attack',
    {
      trigger: 'Let a shambler reach you and attack.',
      debugHint: "?debug=1: Use the debug panel's spawn action to spawn shamblers nearby.",
    },
  ],
  [
    'shambler_hurt',
    {
      trigger: 'Hit a shambler with a melee attack.',
      debugHint: "?debug=1: Use the debug panel's spawn action to spawn shamblers nearby.",
    },
  ],
  ['player_hurt_light', { trigger: 'Take 1–14 points of damage.' }],
  ['player_nope', { trigger: 'Try an action the player cannot complete.' }],
  [
    'player_hurt_heavy',
    {
      trigger: 'Take 15 or more points of damage.',
      debugHint: "?debug=1: Use the debug panel's damage action to apply damage.",
    },
  ],
  ['melee_swing', { trigger: 'Click the primary mouse button to swing while able to attack.' }],
  ['melee_hit', { trigger: 'Land a weapon melee swing on a shambler.' }],
  [
    'melee_hit_fist',
    {
      trigger: 'Land a fist swing on a shambler.',
      note: 'Stand-in recording until a better fist-hit source is found.',
    },
  ],
  ['gunshot', { trigger: 'Fire a virtual-round debug rifle; both AKM variants are selected randomly per shot.' }],
  ['gunshot_pbs1_reference', { trigger: 'Preview-only PBS-1 suppressed AKM alternatives; not used by gameplay.' }],
  [
    'shotgun_blast',
    {
      trigger: 'Fire a chambered pump shotgun with LMB; rack manually before the next shot.',
      debugHint:
        '?debug=1&loadout=pump: wield and activate the sealed box to unpack; wield the pump, then use the generated reload binding to load loose shells and rack.',
      note: 'Winchester Model 12 near shots from BR’s CC0 library. Approved as-is with #209 by BR (2026-10-04); further improvements deferred. Hearing radius remains a gameplay estimate.',
    },
  ],
  [
    'shotgun_rack_back',
    {
      trigger: 'Double-press R or Use Rack on the held pump to start its backward hand stroke.',
      note: 'BR-selected SpringySpringo source; split back clip. Approved as-is with #209 by BR (2026-10-04); further improvements deferred.',
    },
  ],
  [
    'shotgun_rack_forward',
    {
      trigger: 'A rack reaches the exported forward-stroke boundary (rearward + dwell).',
      note: 'Forward half of the BR-selected split rack. Approved as-is with #209 by BR (2026-10-04); further improvements deferred.',
    },
  ],
  [
    'shotgun_insert',
    {
      trigger:
        'Hold R with the pump in hand and loose shells carried; each insert is a 0.9 s job. Release cancels the partial job; a single tap does nothing.',
      note: 'Single inserts from zer0_sol, not whole reload sequences. Approved as-is with #209 by BR (2026-10-04); further improvements deferred.',
    },
  ],
  [
    'shotgun_hull_drop',
    {
      trigger: 'A fired pump hull lands 0.48 s after its exported eject point, on the simulation clock.',
      note: 'Placeholder: LFA hollow plastic clicks, not actual brass-headed hull drops; no metal layer. Approved as-is with #209 by BR (2026-10-04); further improvements deferred.',
    },
  ],
  ['item_drop_wood', { trigger: 'Drop an item into a pile, or spill it onto the ground.' }],
  ['pouch_take', { trigger: 'Take an item out of a pocket on a worn item.' }],
] satisfies readonly (readonly [SoundEventId, SoundTriggerGuide])[];

export const SOUND_TRIGGER_GUIDE = Object.fromEntries(TRIGGER_ENTRIES) as Record<SoundEventId, SoundTriggerGuide>;
const ORDER = TRIGGER_ENTRIES.map(([id]) => id);

/** BR's listening verdicts, joined into the existing guide note shown on /sounds.html. */
const BR_STATUS_NOTES = new Map<SoundEventId, string>([
  ['player_hurt_light', 'Approved by BR (2026-10-02).'],
  [
    'player_nope',
    `BR (2026-10-05 11:31): “i've added nope1_clean.wav / it's the diegetic sound (the avatar makes a nope sound) for when something doesn't work (when UI is off, and any hints are hidden)”. BR (2026-10-05 11:32): “i recorded it myself 10 minutes ago / yes, CC0” and “no, this one is not heard by shamblers (but if it were a multiplayer game, it'd be heard by other players)”. The 2026-10-05 11:46 ruling says “but the 'nope' sound shall play regardless of UI hints being on or off”.`,
  ],
  ['player_hurt_heavy', 'Approved by BR (2026-10-02).'],
  ['player_strain', 'Approved by BR (2026-10-02).'],
  [
    'player_landing_hard',
    'Placeholder: BR approved the current generic jump/landing recording (2026-10-02); a hard-landing-specific sound remains future work.',
  ],
  ['footstep_grass', 'Approved by BR (2026-10-02).'],
  [
    'footstep_mud',
    'Approved by BR (2026-10-06): “mud steps: much better”. Replaces rubberduck clips BR found too intense for a muddy trail.',
  ],
  ['footstep_sand', 'Approved by BR (2026-10-02); currently shares its grass/sand recording set with footstep_grass.'],
  ['footstep_stone', 'To replace as stone: BR heard gravel; keep current clips for a future gravel surface.'],
  ['footstep_wood', 'Approved by BR (2026-10-02) after re-leveling; current variants retained.'],
  [
    'footstep_leaves',
    'Approved by BR (2026-10-02) with one variant; leaves-02 was rejected as linoleum and remains unreferenced.',
  ],
  [
    'shambler_step_grass',
    'Approved by BR (2026-10-02); current clips remain MVP stand-ins for bespoke shambler foley.',
  ],
  [
    'shambler_step_mud',
    'Uses the approved player mud-step set pitched down as an MVP stand-in; bespoke shambler foley remains future work.',
  ],
  ['shambler_step_sand', 'Approved by BR (2026-10-02); current clips remain MVP stand-ins for bespoke shambler foley.'],
  ['shambler_step_stone', 'To replace as stone: BR heard gravel; keep current clips for a future gravel surface.'],
  ['shambler_step_wood', 'Approved by BR (2026-10-02) after re-leveling; current clips remain MVP stand-ins.'],
  [
    'shambler_step_leaves',
    'Approved by BR (2026-10-02) with one variant; leaves-02 was rejected as linoleum and remains unreferenced.',
  ],
  ['melee_swing', 'Approved by BR (2026-10-02); more swing variants remain future work.'],
  ['melee_hit', 'Approved by BR (2026-10-02).'],
  [
    'melee_hit_fist',
    'Placeholder: BR approved this stand-in (2026-10-02); replace when a better fist-hit source is found.',
  ],
  [
    'gunshot',
    'Approved by BR (2026-10-02); akm_1p v1/v2 are random per-shot variants used for virtual-round debug rifles. The pump uses shotgun_blast.',
  ],
  ['gunshot_pbs1_reference', 'Reserved PBS-1 suppressed alternatives for a future suppressor; not used by gameplay.'],
  ['item_drop_wood', 'Approved by BR (2026-10-02) on wood; splitting by pile surface remains future work.'],
  ['pouch_take', 'Approved by BR (2026-10-02).'],
  ['shambler_idle', 'Approved by BR (2026-10-02).'],
  ['shambler_alert', 'Approved by BR (2026-10-02).'],
  ['shambler_attack', 'Approved by BR (2026-10-02).'],
  ['shambler_hurt', 'Approved by BR (2026-10-02).'],
  ['door_open', 'Approved by BR (2026-10-02) with door-open-03 only; more variants are future work.'],
  [
    'door_roller_open',
    'Temporary stand-in: uses the door-open recording; a dedicated roller-door sound remains future work.',
  ],
  ['door_close', 'Approved by BR (2026-10-02).'],
  [
    'door_blocked_close',
    'Placeholder: shares door_close’s recording, approved by BR (2026-10-02); a distinct stuck-door sound is future work.',
  ],
]);

interface SoundVariantGuide {
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
  readonly minIntervalSimSeconds: number;
  readonly noiseRadiusMetres: number | null;
  readonly note: string | null;
  readonly variants: readonly SoundVariantGuide[];
}

export interface HeartbeatSoundGuide {
  readonly id: 'player-heartbeat';
  readonly category: 'body';
  readonly trigger: string;
  readonly status: string;
  readonly variants: readonly SoundVariantGuide[];
}

/** Joins the live sound definitions to their source/author/licence rows in the asset manifest. */
const assetSourcesByFile = (manifest: Manifest) =>
  new Map(manifest.sources.flatMap((source) => source.files.map((file) => [file, source] as const)));

const soundVariant = (file: string, source: Manifest['sources'][number] | undefined): SoundVariantGuide => ({
  file,
  sourcePack: source?.title ?? 'Missing source in assets/manifest.json',
  author: source?.author ?? 'Uncredited',
  licence: source?.licence ?? 'Unknown licence',
  sourceUrl: source?.url ?? null,
});

export const buildHeartbeatSoundGuide = (manifest: Manifest): HeartbeatSoundGuide => {
  const byFile = assetSourcesByFile(manifest);
  return {
    id: 'player-heartbeat',
    category: 'body',
    trigger: 'Sprint to lower stamina, then stop and listen as it recovers.',
    status: "placeholder, awaiting BR's verdict.",
    variants: Object.values(HEARTBEAT_FILES).map((file) => soundVariant(file, byFile.get(file))),
  };
};

export const HEARTBEAT_PREVIEW_LEVELS = [
  {
    label: `at ${HEARTBEAT_TUNING.startStamina}% stamina`,
    gain: heartbeatForStamina(HEARTBEAT_TUNING.startStamina).gain,
  },
  { label: 'at exhaustion', gain: heartbeatForStamina(0).gain },
] as const;

export const renderHeartbeatSoundGuide = (
  heartbeat: HeartbeatSoundGuide,
  preview: (file: string, gain: number) => void,
) => html`
  <article class="sound-event" data-sound-event=${heartbeat.id}>
    <header>
      <h2><code>${heartbeat.id}</code><span class="category">${heartbeat.category}</span></h2>
    </header>
    <p class="sound-trigger"><strong>How to hear:</strong> ${heartbeat.trigger}</p>
    <p class="sound-note"><strong>BR status:</strong> ${heartbeat.status}</p>
    <ul class="sound-variants" aria-label="Player heartbeat recordings">
      ${heartbeat.variants.map(
        (variant) => html`
          <li>
            <code class="variant-file">${variant.file}</code>
            <span class="variant-credit">
              ${
                variant.sourceUrl
                  ? html`<a href=${variant.sourceUrl} target="_blank" rel="noreferrer">${variant.sourcePack}</a>`
                  : variant.sourcePack
              }
              · ${variant.author} · ${variant.licence}
            </span>
            ${HEARTBEAT_PREVIEW_LEVELS.map(
              ({ label, gain }) => html`
                <button type="button" @click=${() => preview(variant.file, gain)}>Play ${label}</button>
              `,
            )}
          </li>
        `,
      )}
    </ul>
  </article>
`;

export const buildSoundGuide = (sounds: readonly SoundDef[], manifest: Manifest): SoundGuideEntry[] => {
  const byFile = assetSourcesByFile(manifest);
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
        minIntervalSimSeconds: sound.minIntervalSimSeconds,
        noiseRadiusMetres: sound.noise.enabled ? sound.noise.radiusMetres : null,
        note: [BR_STATUS_NOTES.get(id), trigger.note].filter((note) => note !== undefined).join(' '),
        variants: sound.variants.map((file) => soundVariant(file, byFile.get(file))),
      },
    ];
  });
};
