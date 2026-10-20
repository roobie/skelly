// biome-ignore lint/correctness/noUnresolvedImports: the browser loads this ESM module from jsDelivr.
import { html, render } from 'https://cdn.jsdelivr.net/npm/lit-html@3.3.3/+esm';
import { loadPlaytestText } from '../../../../site/playtestCatalog.js';
import { applyPlaytestLanguage } from '../../../../site/playtestLanguage.js';

// Bumped by each published patch; see `docs/playtest-run.md`, "Frozen round publication".
const PATCH = 1;
const language = applyPlaytestLanguage(navigator.languages, location.search);
const text = await loadPlaytestText(fetch, new URL('../../../../site/playtest.json', import.meta.url), language);

const app = text
  ? html`<main>
      <header class="brand">
        <img class="site-logo" src="./assets/deadvox-survival-logo.webp" alt="Deadvox Survival" />
      </header>
      <section class="card playtest-card" lang=${language} aria-labelledby="round-title">
        <h1 id="round-title" class="eyebrow">Deadvox · ${text.round} 2 ${text.title} · ${text.patch} ${PATCH}</h1>
        <p class="round-intro">${text.gauntletTask}</p>
        <ul>
          <li>${text.duration}</li>
          <li>${text.metrics}</li>
          <li>${text.sending}</li>
          <li>${text.analytics}</li>
          <li>${text.feedbackBefore}<a href="https://github.com/roobie/skelly/issues/new?template=playtest-feedback.md">${text.feedbackLink}</a>${text.feedbackAfter}</li>
          <li>${text.email}</li>
        </ul>
        <section class="mode" aria-labelledby="mode-play">
          <h2 id="mode-play">${text.playHeading}</h2>
          <a class="playtest-action" href="{{PLAY_URL}}">${text.gauntletLink}</a>
        </section>
        <section class="mode" aria-labelledby="mode-beginner">
          <h2 id="mode-beginner">${text.beginnerHeading}</h2>
          <p>${text.beginnerHint}</p>
          <a class="beginner-action" href="{{PLAY_URL}}&mods=beginner">${text.beginnerLink}</a>
        </section>
        <section class="mode" aria-labelledby="mode-tutorial">
          <h2 id="mode-tutorial">${text.tutorialHeading}</h2>
          <p>${text.tutorialHint}</p>
          <a class="tutorial-action" href="{{PLAY_URL}}&tutorial=1">${text.tutorialLink}</a>
        </section>
      </section>
      <footer><a href="https://roobie.github.io/skelly/">skelly projects</a></footer>
    </main>`
  : html`<main>
      <header class="brand">
        <img class="site-logo" src="./assets/deadvox-survival-logo.webp" alt="Deadvox Survival" />
      </header>
      <section class="card playtest-card" aria-labelledby="round-title">
        <h1 id="round-title" class="eyebrow">Deadvox · Round 2 Playtest</h1>
        <p>The playtest information could not be loaded. Please reload this page.</p>
      </section>
      <footer><a href="https://roobie.github.io/skelly/">skelly projects</a></footer>
    </main>`;

render(app, document.querySelector('#app'));
