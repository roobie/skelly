import { html } from 'lit-html';
import type { Manifest } from '../core/assets.ts';
import type { SoundDef } from '../core/content.ts';
import type { SoundId } from '../core/soundEvents.ts';
import { soundVariantKey } from '../core/soundSynth.ts';
import { type HeartbeatTuning, heartbeatForStamina } from '../game/audioPresentation.ts';

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
  readonly variants: readonly SoundVariantGuide[];
}

export interface HeartbeatSoundGuide {
  readonly id: 'player-heartbeat';
  readonly category: 'body';
  readonly trigger: string;
  readonly variants: readonly (SoundVariantGuide & { readonly event: SoundId })[];
  readonly levels: readonly { readonly label: string; readonly gain: number }[];
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

/** The heartbeat's own card previews its content sound events at in-game loudness. */
export const buildHeartbeatSoundGuide = (
  heartbeat: HeartbeatTuning,
  sounds: ReadonlyMap<SoundId, SoundDef>,
  manifest: Manifest,
): HeartbeatSoundGuide => {
  const byFile = assetSourcesByFile(manifest);
  return {
    id: 'player-heartbeat',
    category: 'body',
    trigger: 'Sprint to lower stamina, then stop and listen as it recovers.',
    variants: Object.values(heartbeat.sounds).flatMap((event) =>
      (sounds.get(event)?.variants ?? []).map((variant) => {
        const file = soundVariantKey(event, variant);
        return {
          ...(typeof variant === 'string' ? soundVariant(file, byFile.get(file)) : synthesisedVariant(file)),
          event,
        };
      }),
    ),
    levels: [
      {
        label: `at ${heartbeat.startStamina}% stamina`,
        gain: heartbeatForStamina(heartbeat, heartbeat.startStamina).gain,
      },
      { label: 'at exhaustion', gain: heartbeatForStamina(heartbeat, 0).gain },
    ],
  };
};

export const renderHeartbeatSoundGuide = (
  heartbeat: HeartbeatSoundGuide,
  preview: (event: SoundId, gain: number) => void,
) => html`
  <article class="sound-event" data-sound-event=${heartbeat.id}>
    <header>
      <h2><code>${heartbeat.id}</code><span class="category">${heartbeat.category}</span></h2>
    </header>
    <p class="sound-trigger"><strong>How to hear:</strong> ${heartbeat.trigger}</p>
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
            ${heartbeat.levels.map(
              ({ label, gain }) => html`
                <button type="button" @click=${() => preview(variant.event, gain)}>Play ${label}</button>
              `,
            )}
          </li>
        `,
      )}
    </ul>
  </article>
`;

/** Lists every sound in content order; its trigger and shortcut come from the sound's own content entry. */
export const buildSoundGuide = (sounds: readonly SoundDef[], manifest: Manifest): SoundGuideEntry[] => {
  const byFile = assetSourcesByFile(manifest);
  return sounds.map((sound) => ({
    id: sound.id as SoundId,
    category: sound.category,
    trigger: sound.description,
    debugHint: sound.debugHint ?? null,
    gain: sound.gain,
    pitchJitter: sound.pitchJitter,
    gainJitter: sound.gainJitter,
    minIntervalSimSeconds: sound.minIntervalSimSeconds,
    noiseRadiusMetres: sound.noise.enabled ? sound.noise.radiusMetres : null,
    variants: sound.variants.map((variant) =>
      typeof variant === 'string'
        ? soundVariant(variant, byFile.get(variant))
        : synthesisedVariant(soundVariantKey(sound.id as SoundId, variant)),
    ),
  }));
};
