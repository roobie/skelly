import { html, render } from 'lit-html';
import assetManifest from './content/base/assets/manifest.json' with { type: 'json' };
import soundFile from './content/base/sounds.json' with { type: 'json' };
import type { Manifest } from './core/assets.ts';
import { buildRegistry } from './core/content.ts';
import type { SoundEventId } from './core/soundEvents.ts';
import { GameAudio } from './game/audio.ts';
import { buildHeartbeatSoundGuide, buildSoundGuide } from './ui/soundGuide.ts';

const source = '../content/base/sounds.json';
const { registry, issues } = buildRegistry([{ source, data: soundFile }]);
const guide = buildSoundGuide([...registry.sounds.values()], assetManifest as Manifest);
const heartbeat = buildHeartbeatSoundGuide(assetManifest as Manifest);
const errorRoot = document.createElement('p');
errorRoot.className = 'sound-errors';
errorRoot.setAttribute('role', 'status');

const audio = new GameAudio({
  registry,
  blockSize: 1,
  isSolid: () => false,
  report: (message) => {
    errorRoot.textContent = message;
  },
});
audio.updateListener([0, 0, 0], [0, 0, -1]);

const playExact = (event: SoundEventId, file: string) => {
  errorRoot.textContent = '';
  try {
    audio.unlock();
    if (!audio.preview(event, file)) {
      errorRoot.textContent = `Could not preview ${file} for ${event}.`;
    }
  } catch (error) {
    errorRoot.textContent = `Audio preview failed: ${String(error)}`;
  }
};

const sheet = html`
  <header class="sound-page-header">
    <div>
      <p class="eyebrow">DEADVOX · AUDIO REFERENCE</p>
      <h1>Listening sheet</h1>
      <p>
        Generated from <code>sounds.json</code> and <code>assets/manifest.json</code>. Preview buttons play the exact
        listed file at base event gain and pitch 1, through the game's saved master/category volume settings; variant
        selection jitter and cooldown are bypassed.
      </p>
      <p class="sound-debug-note">
        Ordered roughly as a player encounters movement, doors, jumping, shamblers, damage, and combat. No event is
        debug-only; repeatable <code>?debug=1</code> shortcuts are listed where useful.
      </p>
      <nav><a href="./">Back to game</a> · <a href="./?debug=1">Open game with debug help</a></nav>
    </div>
    <div class="sound-count">${guide.length} events · ${guide.reduce((sum, event) => sum + event.variants.length, heartbeat.variants.length)} variants</div>
  </header>
  ${issues.length > 0 ? html`<p class="sound-errors">Content validation: ${issues.map((issue) => issue.message).join('; ')}</p>` : ''}
  <section class="sound-list" aria-label="Sound events and bodily cues in gameplay order">
    ${guide.map(
      (event) => html`
        <article class="sound-event" data-sound-event=${event.id}>
          <header>
            <h2><code>${event.id}</code><span class="category">${event.category}</span></h2>
          </header>
          <p class="sound-trigger"><strong>How to hear:</strong> ${event.trigger}</p>
          ${event.debugHint ? html`<p class="debug-hint"><strong>Debug shortcut:</strong> ${event.debugHint}</p>` : ''}
          <dl class="sound-settings">
            <div><dt>Gain</dt><dd>${event.gain}</dd></div>
            <div><dt>Pitch jitter</dt><dd>${event.pitchJitter[0]}–${event.pitchJitter[1]}</dd></div>
            <div><dt>Gain jitter</dt><dd>${event.gainJitter[0]}–${event.gainJitter[1]}</dd></div>
            <div><dt>Minimum interval</dt><dd>${event.minIntervalSeconds} s</dd></div>
            <div><dt>Noise radius</dt><dd>${event.noiseRadiusMetres === null ? 'not emitted as noise' : `${event.noiseRadiusMetres} m`}</dd></div>
          </dl>
          ${event.note ? html`<p class="sound-note"><strong>BR status:</strong> ${event.note}</p>` : ''}
          <ul class="sound-variants" aria-label=${`${event.id} recordings`}>
            ${event.variants.map(
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
                  <button type="button" @click=${() => playExact(event.id, variant.file)}>Play exact file</button>
                </li>
              `,
            )}
          </ul>
        </article>
      `,
    )}
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
            </li>
          `,
        )}
      </ul>
    </article>
  </section>
`;

const root = document.querySelector<HTMLElement>('#sound-sheet');
if (!root) {
  throw new Error('Missing #sound-sheet root');
}
render(sheet, root);
root.prepend(errorRoot);
