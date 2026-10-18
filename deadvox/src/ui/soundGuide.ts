import { html } from 'lit-html';
import type { Manifest } from '../core/assets.ts';
import type { SoundDef } from '../core/content.ts';
import type { SoundId } from '../core/soundEvents.ts';
import { soundVariantKey } from '../core/soundSynth.ts';
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
  ...(['runner', 'crawler', 'amalgam'] as const).flatMap((type) => {
    const subject = { runner: 'A runner', crawler: 'A crawler', amalgam: 'An amalgam' }[type];
    return (['idle', 'alert', 'attack', 'hurt'] as const).map((action) => {
      const event = {
        idle: 'idles nearby',
        alert: 'notices you',
        attack: 'reaches you and attacks',
        hurt: 'is hit by a melee attack',
      }[action];
      return [
        `${type}_${action}`,
        {
          trigger: `${subject} ${event}.`,
          debugHint: `?debug=1: Use the debug panel's ${type} action to spawn ${type}s nearby.`,
        },
      ] as const;
    });
  }),
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
  ['melee_swing_light', { trigger: 'Swing a light blade (knife or machete).' }],
  ['melee_swing_heavy', { trigger: 'Swing a heavy weapon (bat, pipe or crowbar).' }],
  ['melee_hit', { trigger: 'Land a weapon melee swing on a shambler.' }],
  [
    'melee_hit_metal',
    { trigger: 'Land a swing with a metal weapon (pipe, crowbar or hammer); it layers over the melee hit.' },
  ],
  [
    'melee_hit_fist',
    {
      trigger: 'Land a fist swing on a shambler.',
      note: 'Stand-in recording until a better fist-hit source is found.',
    },
  ],
  [
    'gunshot',
    {
      trigger:
        'Fire the AK-pattern rifle; its AKM samples vary per shot. Fitted suppressors reduce hearing distance: the improvised suppressor is louder than the real one, and wear makes either louder.',
    },
  ],
  ['gunshot_pbs1_reference', { trigger: 'Preview-only PBS-1 suppressed AKM alternatives; not used by gameplay.' }],
  ['gunshot_m4', { trigger: 'Fire the AR-pattern rifle without a suppressor fitted.' }],
  [
    'gunshot_m4_suppressed',
    {
      trigger:
        'Fire the AR-pattern rifle with a real suppressor fitted; it reduces the shot’s hearing distance, and wear makes it carry farther.',
    },
  ],
  ['gunshot_tikka', { trigger: 'Fire the bolt-action hunting rifle.' }],
  ['revolver_shot', { trigger: 'Fire the revolver on a live round.' }],
  ['revolver_dry_click', { trigger: 'Pull the revolver’s trigger on an empty or spent chamber.' }],
  ['revolver_crane_open', { trigger: 'Start a revolver reload: the crane swings out.' }],
  ['revolver_crane_close', { trigger: 'Finish or release a revolver reload: the crane closes.' }],
  ['revolver_eject', { trigger: 'Dump the cylinder with the ejector rod.' }],
  ['revolver_case_pick', { trigger: 'Top up the revolver: each spent case is picked out by hand.' }],
  ['revolver_round_insert', { trigger: 'Load one loose round into an open cylinder.' }],
  ['revolver_hammer_cock', { trigger: 'Cock the revolver’s hammer for a single-action shot.' }],
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
  [
    'grenade_blast',
    {
      trigger: 'A thrown hand grenade goes off when its fuse runs out.',
      debugHint:
        '?debug=1&loadout=grenade: click the primary mouse button to pull the pin, tap T for the throwing stance, hold then release the primary mouse button to throw, and step back.',
    },
  ],
  ['rifle_bolt_cycle', { trigger: 'Double-press R with the hunting rifle in hand to work the bolt.' }],
  ['firearm_dry_click', { trigger: 'Pull the trigger of a magazine gun or the hunting rifle with an empty chamber.' }],
  [
    'magazine_round_insert',
    {
      trigger:
        'Hold R with a magazine in hand and loose matching cartridges carried; each round is one handling job. Release cancels the partial job.',
      note: 'Stand-in: the pump-insert recordings, pitched up; a magazine-specific click is future work (d114).',
    },
  ],
  [
    'magazine_round_strip',
    {
      trigger: "Use a loaded magazine in hand (its 'Strip a round' item action) to strip its top round.",
      note: 'Stand-in: the pump-insert recordings, pitched higher still; a magazine-specific click is future work (d114).',
    },
  ],
  [
    'magazine_change',
    {
      trigger:
        'With an AR or AK in hand, hold R to change or insert a magazine, or tap then hold R to remove it. The job finishes even if R is released.',
      note: 'BMacZero’s clip loads, BR’s pick.',
    },
  ],
  [
    'rifle_charge',
    {
      trigger: 'Double-press R with an AR or AK in hand to work the charging handle.',
      note: 'Stand-in: the pump rack-back recording, pitched up; a charging-handle sound is future work (d114).',
    },
  ],
  ['item_drop_wood', { trigger: 'Drop an item into a pile, or spill it onto the ground.' }],
  ['pouch_take', { trigger: 'Take an item out of a pocket on a worn item.' }],
  ['breath_inhale', { trigger: 'Not played in game yet: waits for hold-breath. Preview it here.' }],
  ['breath_exhale', { trigger: 'Not played in game yet: waits for hold-breath. Preview it here.' }],
  ['breath_gasp', { trigger: 'Not played in game yet: waits for hold-breath. Preview it here.' }],
  ['door_knock_jfxr', { trigger: 'Preview only; not used by gameplay.' }],
] satisfies readonly (readonly [SoundId, SoundTriggerGuide])[];

export const SOUND_TRIGGER_GUIDE = Object.fromEntries(TRIGGER_ENTRIES) as Record<SoundId, SoundTriggerGuide>;

/** BR's listening verdicts, joined into the existing guide note shown on /sounds.html. */
const BR_STATUS_NOTES = new Map<SoundId, string>([
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
  ['melee_swing', 'Approved by BR (2026-10-02); the fallback for a melee weapon with no swing of its own.'],
  ['melee_hit', 'Approved by BR (2026-10-02).'],
  [
    'melee_hit_fist',
    'Placeholder: BR approved this stand-in (2026-10-02); replace when a better fist-hit source is found.',
  ],
  ['melee_swing_light', 'Cut from florianreichelt’s “Light wooshes”, BR’s pick; awaiting BR’s listen.'],
  ['melee_swing_heavy', 'qubodup’s bamboo “Whoosh” pitched down, BR’s pick; awaiting BR’s listen.'],
  ['melee_hit_metal', 'Cut from “Metal Impact” and “Hitting metal pole”, BR’s pick; awaiting BR’s listen.'],
  ['gunshot_tikka', 'FFSL Tikka T3 near take, BR’s pick; awaiting BR’s listen.'],
  ['revolver_shot', 'FFSL S&W 642 near take, BR’s pick; a .38 Special may sound quieter than the game’s .357.'],
  [
    'revolver_hammer_cock',
    'Cut from the S&W 642 raw takes by waveform, not by ear; the 642 hides its hammer, so check the label.',
  ],
  ['revolver_dry_click', 'Cut from the S&W 642 raw takes by waveform, not by ear; awaiting BR’s listen.'],
  ['revolver_crane_open', 'Cut from the S&W 642 raw takes by waveform, not by ear; awaiting BR’s listen.'],
  ['revolver_crane_close', 'Cut from the S&W 642 raw takes by waveform, not by ear; awaiting BR’s listen.'],
  ['revolver_eject', 'Cut from the S&W 642 raw takes by waveform, not by ear; awaiting BR’s listen.'],
  ['revolver_case_pick', 'Equipment Clicks III fallback: the S&W 642 takes hold no case pick; awaiting BR’s listen.'],
  ['revolver_round_insert', 'Cut from the S&W 642 raw takes by waveform, not by ear; awaiting BR’s listen.'],
  ['rifle_bolt_cycle', 'Equipment Clicks III bolt cocking, BR’s pick; awaiting BR’s listen.'],
  ['firearm_dry_click', 'Shutter clicks cut from “DSLR Camera Sounds”, BR’s pick; awaiting BR’s listen.'],
  ['grenade_blast', 'The two blasts in florianreichelt’s “Huge Explosion”, BR’s pick; awaiting BR’s listen.'],
  ['gunshot', 'Approved; AKM variants used for the AK-pattern rifle and firearms without a dedicated shot profile.'],
  ['gunshot_pbs1_reference', 'Reserved PBS-1 suppressed AKM alternatives; not used by gameplay.'],
  ['gunshot_m4', 'FFSL AR-15 near take, BR’s pick; awaiting BR’s listen.'],
  [
    'gunshot_m4_suppressed',
    'CC0 synthesised suppressed M4 shot used when a real suppressor is fitted to the AR-pattern rifle.',
  ],
  ['item_drop_wood', 'Approved by BR (2026-10-02) on wood; splitting by pile surface remains future work.'],
  ['pouch_take', 'Approved by BR (2026-10-02).'],
  ['breath_inhale', 'A jfxr preset, awaiting BR’s listen.'],
  ['breath_exhale', 'A jfxr preset, awaiting BR’s listen.'],
  ['breath_gasp', 'A jfxr preset, awaiting BR’s listen.'],
  ['door_knock_jfxr', 'BR’s own jfxr door-knock preset, kept for listening.'],
  ['shambler_idle', 'Approved by BR (2026-10-02).'],
  ['shambler_alert', 'Approved by BR (2026-10-02).'],
  ['shambler_attack', 'Approved by BR (2026-10-02).'],
  ['shambler_hurt', 'Approved by BR (2026-10-02).'],
  ...(['runner', 'crawler'] as const).flatMap((type) =>
    (['idle', 'alert', 'attack', 'hurt'] as const).map(
      (action) => [`${type}_${action}`, 'Stand-in mapping; awaiting BR review of this zombie type’s sounds.'] as const,
    ),
  ),
  ...(['idle', 'alert', 'attack', 'hurt'] as const).map(
    (action) =>
      [
        `amalgam_${action}`,
        'Stand-in mapping: reuses shambler recordings pitched down; bespoke amalgam recordings remain future work.',
      ] as const,
  ),
  ['door_open', 'Approved by BR (2026-10-02) with door-open-03 only; more variants are future work.'],
  [
    'door_roller_open',
    'Temporary stand-in: uses the door-open recording; revisit a dedicated roller-door sound after playtest 1.',
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
  readonly synthesised?: true;
}

export interface SoundGuideEntry {
  readonly id: SoundId;
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

// A recipe has no recording behind it, so there is no one to credit and no licence to name.
const synthesisedVariant = (file: string): SoundVariantGuide => ({
  file,
  sourcePack: 'Synthesised from a recipe in content; no recording or credit',
  author: 'None',
  licence: 'None',
  sourceUrl: null,
  synthesised: true,
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
  return TRIGGER_ENTRIES.flatMap(([id, trigger]: readonly [SoundId, SoundTriggerGuide]) => {
    const sound = definitions.get(id);
    if (!sound) {
      return [];
    }
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
        variants: sound.variants.map((variant) =>
          typeof variant === 'string'
            ? soundVariant(variant, byFile.get(variant))
            : synthesisedVariant(soundVariantKey(id, variant)),
        ),
      },
    ];
  });
};
