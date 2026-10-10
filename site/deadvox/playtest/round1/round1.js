// biome-ignore lint/correctness/noUnresolvedImports: the browser loads this ESM module from jsDelivr.
import { html, render } from 'https://cdn.jsdelivr.net/npm/lit-html@3.3.3/+esm';
import { loadPlaytestText } from '../../../playtestCatalog.js';
import { applyPlaytestLanguage } from '../../../playtestLanguage.js';

const language = applyPlaytestLanguage(navigator.languages, location.search);
const text = await loadPlaytestText(fetch, new URL('../../../playtest.json', import.meta.url), language);

const app = text
  ? html`<main>
      <header class="brand">
        <img class="site-logo" src="../../../assets/deadvox-survival-logo.webp" alt="Deadvox Survival" />
      </header>
      <section class="card playtest-card" lang=${language} aria-labelledby="round-title">
        <h1 id="round-title" class="eyebrow">Deadvox · ${text.round} 1 ${text.title}</h1>
        <p class="round-intro">${text.task}</p>
        <ul>
          <li>${text.duration}</li>
          <li>${text.metrics}</li>
          <li>${text.sending}</li>
          <li>${text.analytics}</li>
          <li>${text.feedbackBefore}<a href="https://github.com/roobie/skelly/issues/new?template=playtest-feedback.md">${text.feedbackLink}</a>${text.feedbackAfter}</li>
          <li>${text.email}</li>
        </ul>
        <p><a class="playtest-action" href="../../../deadvox/?site=playtest">${text.playLink}</a></p>
      </section>
      <footer><a href="../../../">skelly projects</a></footer>
    </main>`
  : html`<main>
      <header class="brand">
        <img class="site-logo" src="../../../assets/deadvox-survival-logo.webp" alt="Deadvox Survival" />
      </header>
      <section class="card playtest-card" aria-labelledby="round-title">
        <h1 id="round-title" class="eyebrow">Deadvox · Round 1 Playtest</h1>
        <p>The playtest information could not be loaded. Please reload this page.</p>
      </section>
      <footer><a href="../../../">skelly projects</a></footer>
    </main>`;

render(app, document.querySelector('#app'));
