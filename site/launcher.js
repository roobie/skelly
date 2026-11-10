// biome-ignore lint/correctness/noUnresolvedImports: the browser loads this ESM module from jsDelivr.
import { html, render } from 'https://cdn.jsdelivr.net/npm/lit-html@3.3.3/+esm';

// The static launcher cannot import packages/engine/src/core/weather.ts; keep its control range in sync with WEATHERING_STRENGTH_MAX.
const WEATHERING_STRENGTH_MAX = 8;

const page = (state) => html`  <main>
      <section class="card" aria-labelledby="deadvox-title">
        <div class="card-heading">
          <h2 id="deadvox-title"><a href="deadvox/">deadvox</a> <code>(codename)</code></h2>
          <p>A singleplayer voxel survival prototype with data-driven content.</p>
        </div>
        <form id="deadvox-form" @input=${onInput} @change=${onInput} @submit=${onSubmit}>
          <div class="form-grid">
            <label>Start mode
              <select name="bench" data-url-param="bench" id="deadvox-bench" data-state-key="bench" .value=${state.deadvox.bench} .disabled=${!enabled('bench', state)}>
                <option value="">Play</option>
                <option value="1">World benchmark</option>
                <option value="shamblers">Shambler benchmark</option>
                <option value="report">Benchmark report</option>
              </select>
            </label>
            <div>
              <label id="deadvox-seed-field" ?hidden=${!visible('deadvox-seed-field', state)}>Seed
                <input name="seed" data-url-param="seed" type="number" step="1" min="-2147483648" max="2147483647" value="1" required  data-state-key="seed" .value=${state.deadvox.seed} .disabled=${!enabled('seed', state)}/>
              </label>
              The seed is the starting value the random number generator uses to generate a sequence of seemingly random numbers. This means that a new seed will cause a completely 'new' world to be generated.
            </div>
            <label id="deadvox-time-field" ?hidden=${!visible('deadvox-time-field', state)}>Start time
              <input name="time" data-url-param="start-mod" type="time" value="19:30" data-default-time="19:30" required  data-state-key="time" .value=${state.deadvox.time} .disabled=${!enabled('time', state)}/>
            </label>
            <label id="deadvox-radius-field" ?hidden=${!visible('deadvox-radius-field', state)}>View distance (m)
              <input name="radius" data-url-param="radius" type="number" min="32" max="256" step="1" value="96" required  data-state-key="radius" .value=${state.deadvox.radius} .disabled=${!enabled('radius', state)}/>
            </label>
            <label id="deadvox-site-field" ?hidden=${!visible('deadvox-site-field', state)}>Site
              <select name="site" data-url-param="start-mod" id="deadvox-site" data-state-key="site" .value=${state.deadvox.site} .disabled=${!enabled('site', state)}>
                <option id="deadvox-default-site" value="">Gauntlet (default)</option>
                <option value="city">Stress-test city</option>
                <option value="forest">Forest (tree first look)</option>
                ${siteOffered(state.deadvox, 'gauntlet') ? html`<option value="gauntlet">Gauntlet</option>` : ''}
                ${siteOffered(state.deadvox, 'tutorial') ? html`<option value="tutorial">Practice tutorial (unsaved)</option>` : ''}
                ${siteOffered(state.deadvox, 'testHouse') ? html`<option value="testHouse">Test house (debug)</option><option value="weatheringTest">Debug weathering comparison</option>` : ''}
              </select>
            </label>
            <label id="deadvox-actors-field" ?hidden=${!visible('deadvox-actors-field', state)}>Zombie models
              <select name="actors" data-url-param="actors" data-state-key="actors" .value=${state.deadvox.actors} .disabled=${!enabled('actors', state)}>
                <option value="">Detailed (default)</option>
                <option value="boxes">Boxes</option>
              </select>
            </label>
            ${
              state.bundledMods.length > 0
                ? html`
            <fieldset id="deadvox-mods-field" ?hidden=${!visible('deadvox-mods-field', state)}>
              <legend>Mods</legend>
              ${state.bundledMods.map(
                (mod) => html`
              <label class="check" title=${mod.detail}>
                <input name="mods" data-url-param="mods" data-mod-id=${mod.id} type="checkbox" .checked=${state.deadvox.mods.includes(mod.id)} .disabled=${!enabled('mods', state)}/> ${mod.label}
              </label>`,
              )}
            </fieldset>`
                : ''
            }
            <label class="check" id="deadvox-debug-field" ?hidden=${!visible('deadvox-debug-field', state)}>
              <input name="debug" data-url-param="debug" type="checkbox" data-state-key="debug" .checked=${state.deadvox.debug} .disabled=${!enabled('debug', state)}/> Enable development tools (#{debug:true})
            </label>
            <label id="deadvox-at-field" ?hidden=${!visible('deadvox-at-field', state)}>Debug start position (m): x,z[,yaw°]
              <input name="at" data-url-param="at" type="text" placeholder="x,z[,yaw]" autocomplete="off"  data-state-key="at" .value=${state.deadvox.at} .disabled=${!enabled('at', state)}/>
            </label>
            <label id="deadvox-focus-field" ?hidden=${!visible('deadvox-focus-field', state)}>Showroom focus (furniture id; blank: default spawn)
              <input name="focus" data-url-param="focus" type="text" placeholder="grinding_wheel" autocomplete="off" spellcheck="false" data-state-key="focus" .value=${state.deadvox.focus} .disabled=${!enabled('focus', state)}/>
            </label>
            <label id="deadvox-wobble-flat-field" ?hidden=${!visible('deadvox-wobble-flat-field', state)}>Debug wobble vertical/horizontal ratio (blank: content default)
              <input name="wobbleFlat" data-url-param="wobbleFlat" type="number" min="0" max="1" step="any" placeholder="content default"  data-state-key="wobbleFlat" .value=${state.deadvox.wobbleFlat} .disabled=${!enabled('wobbleFlat', state)}/>
            </label>
            <label id="deadvox-weathering-field" ?hidden=${!visible('deadvox-weathering-field', state)}>Debug weathering strength (blank: content default)
              <input name="weathering" data-url-param="weathering" type="number" min="0" max="${WEATHERING_STRENGTH_MAX}" step="any" placeholder="content default" data-state-key="weathering" .value=${state.deadvox.weathering} .disabled=${!enabled('weathering', state)}/>
            </label>
            <label id="deadvox-weathering-variation-field" ?hidden=${!visible('deadvox-weathering-variation-field', state)}>Debug world-scale weathering variation (blank: content default)
              <input name="weatheringVariation" data-url-param="weatheringVariation" type="number" min="0" max="1" step="any" placeholder="content default" data-state-key="weatheringVariation" .value=${state.deadvox.weatheringVariation} .disabled=${!enabled('weatheringVariation', state)}/>
            </label>
            <label id="deadvox-weathering-split-field" ?hidden=${!visible('deadvox-weathering-split-field', state)}>Debug weathering split (world x in metres; comparison site defaults to 0)
              <input name="weatheringSplit" data-url-param="weatheringSplit" type="number" min="-256" max="256" step="any" placeholder="comparison site default" data-state-key="weatheringSplit" .value=${state.deadvox.weatheringSplit} .disabled=${!enabled('weatheringSplit', state)}/>
            </label>
          </div>

          <div id="deadvox-world-bench" ?hidden=${!visible('deadvox-world-bench', state)}>
            <hr class="section-divider" />
            <h3>World benchmark</h3>
            <div class="form-grid">
              <label>Benchmark plan (block size:radius m, comma-separated)
                <input name="plan" data-url-param="plan" type="text" value="0.5:64,0.5:96,0.5:128" autocomplete="off" required  data-state-key="plan" .value=${state.deadvox.plan} .disabled=${!enabled('plan', state)}/>
              </label>
              <label>Start at plan entry
                <input id="deadvox-world-index" name="i" data-url-param="i" type="number" min="0" step="1" value="0" required  data-state-key="worldIndex" .value=${state.deadvox.worldIndex} .disabled=${!enabled('worldIndex', state)}/>
              </label>
              <label>Detailed shamblers (0 disables them)
                <input name="shamblers" data-url-param="shamblers" type="number" min="0" max="500" step="1" value="60" required  data-state-key="shamblers" .value=${state.deadvox.shamblers} .disabled=${!enabled('shamblers', state)}/>
              </label>
              <label class="check">
                <input name="quick" data-url-param="quick" type="checkbox"  data-state-key="quick" .checked=${state.deadvox.quick} .disabled=${!enabled('quick', state)}/> Quick check (short, not a result)
              </label>
              <p class="muted">Plan block sizes: 0.25, 0.5 or 1 m; radius: 16–512 m per entry. Time defaults to the site's start time.</p>
            </div>
          </div>

          <div id="deadvox-shambler-bench" ?hidden=${!visible('deadvox-shambler-bench', state)}>
            <hr class="section-divider" />
            <h3>Shambler benchmark</h3>
            <div class="form-grid">
              <label>Shambler counts (unique integers, 1–500)
                <input name="shamblers" data-url-param="shamblers" type="text" value="10,25,50,100" inputmode="numeric" autocomplete="off" required  data-state-key="n" .value=${state.deadvox.n} .disabled=${!enabled('n', state)}/>
              </label>
              <label>Start at count entry
                <input id="deadvox-shambler-index" name="i" data-url-param="i" type="number" min="0" step="1" value="0" required  data-state-key="shamblerIndex" .value=${state.deadvox.shamblerIndex} .disabled=${!enabled('shamblerIndex', state)}/>
              </label>
              <p class="muted">Time defaults to 23:30. The fixture site and view radius are fixed by this benchmark.</p>
            </div>
          </div>

          <div class="action-row">
            <button class="primary" type="submit">Play</button>
          </div>
          <label class="url-label" for="deadvox-url">Direct link</label>
          <div class="url-row">
            <input id="deadvox-url" .value=${state.deadvox.url} type="text" readonly aria-label="Composed deadvox URL" />
            <button type="button" data-copy="deadvox-url" @click=${onCopy}>${state.copied === 'deadvox-url' ? 'Copied' : 'Copy link'}</button>
          </div>
          <p id="deadvox-status" class="status" role="status" aria-live="polite">${state.deadvox.status}</p>
        </form>
        <h3>Quick starts</h3>
        <fieldset class="presets" @click=${onPreset}>
          <legend class="sr-only">Deadvox presets</legend>
          <button type="button" data-deadvox-preset="dusk">Dusk</button>
          <button type="button" data-deadvox-preset="noon">Noon</button>
          <button type="button" data-deadvox-preset="night">Dead of night</button>
          <button type="button" data-deadvox-preset="city">City</button>
          <button type="button" data-deadvox-preset="gauntlet">Gauntlet</button>
          <button type="button" data-deadvox-preset="debug">Debug before dawn</button>
          <button type="button" data-deadvox-preset="benchmark">Benchmark</button>
        </fieldset>
        <p class="status">Debug tools and their current keys are documented in-game.</p>
      </section>

      <section class="card">
        <h2><a href="https://roobie.github.io/skelly-assets/">skelly-assets</a></h2>
        <p>The shared asset library, with the gun, thing and vehicle authoring tools.</p>
      </section>

      <section class="card" aria-labelledby="links-title">
        <h2 id="links-title">Links</h2>
        <ul>
          <li><a href="deadvox/playtest/round1/">Deadvox Round 1 Playtest</a></li>
          <li><a href="https://deadvox-playtest-round2.surge.sh/">Deadvox Round 2 Playtest</a></li>
        </ul>
      </section>

      <footer>Source: <a href="https://github.com/roobie/skelly">github.com/roobie/skelly</a></footer>
    </main>`;
const model = {
  deadvox: {
    bench: '',
    seed: '1',
    time: '12:30',
    radius: '96',
    site: '',
    actors: '',
    mods: [],
    debug: false,
    at: '',
    focus: '',
    wobbleFlat: '',
    weathering: '',
    weatheringVariation: '',
    weatheringSplit: '',
    plan: '0.5:64,0.5:96,0.5:128',
    worldIndex: '0',
    shamblers: '60',
    quick: false,
    n: '10,25,50,100',
    shamblerIndex: '0',
    url: '',
    status: '',
    lastDefault: '12:30',
  },
  copied: '',
  bundledMods: [],
};
const root = document.body.firstElementChild;
const renderPage = () => render(page(model), root);
const visibility = {
  'deadvox-seed-field': (d) => d.bench !== 'report',
  // The tutorial scenario keeps its own start time.
  'deadvox-time-field': (d) => d.bench !== 'report' && d.site !== 'tutorial',
  'deadvox-radius-field': (d) => d.bench === '',
  'deadvox-site-field': (d) => d.bench !== 'report' && d.bench !== 'shamblers',
  'deadvox-actors-field': (d) => d.bench === '',
  'deadvox-mods-field': (d) => d.bench === '',
  'deadvox-debug-field': (d) => d.bench === '',
  'deadvox-at-field': (d) => d.bench === '' && d.debug,
  // Focus picks a showroom prop, and only the test house has a showroom.
  'deadvox-focus-field': (d) => d.bench === '' && d.debug && d.site === 'testHouse',
  'deadvox-wobble-flat-field': (d) => d.bench === '' && d.debug,
  'deadvox-weathering-field': (d) => d.bench === '' && d.debug,
  'deadvox-weathering-variation-field': (d) => d.bench === '' && d.debug,
  'deadvox-weathering-split-field': (d) => d.bench === '' && d.debug,
  'deadvox-world-bench': (d) => d.bench === '1',
  'deadvox-shambler-bench': (d) => d.bench === 'shamblers',
};
const visible = (id, s) => (visibility[id] ? visibility[id](s.deadvox) : true);
const deadvoxControlVisibility = {
  seed: 'deadvox-seed-field',
  time: 'deadvox-time-field',
  radius: 'deadvox-radius-field',
  site: 'deadvox-site-field',
  actors: 'deadvox-actors-field',
  mods: 'deadvox-mods-field',
  debug: 'deadvox-debug-field',
  at: 'deadvox-at-field',
  focus: 'deadvox-focus-field',
  wobbleFlat: 'deadvox-wobble-flat-field',
  weathering: 'deadvox-weathering-field',
  weatheringVariation: 'deadvox-weathering-variation-field',
  weatheringSplit: 'deadvox-weathering-split-field',
  plan: 'deadvox-world-bench',
  shamblers: 'deadvox-world-bench',
  worldIndex: 'deadvox-world-bench',
  quick: 'deadvox-world-bench',
  n: 'deadvox-shambler-bench',
  shamblerIndex: 'deadvox-shambler-bench',
};
const enabled = (key, s) => (deadvoxControlVisibility[key] ? visible(deadvoxControlVisibility[key], s) : true);
// Which site choices a mode offers: the gauntlet scenario, the practice tutorial and the debug sites are play-only.
const siteOffered = (d, site) => {
  if (site === 'gauntlet' || site === 'tutorial') {
    return d.bench === '';
  }
  if (site === 'testHouse' || site === 'weatheringTest') {
    return d.bench === '' && d.debug;
  }
  return true;
};
// The site of the product default start, which a link without a start runs.
const DEFAULT_SITE = 'gauntlet';
const TUTORIAL_MOD = 'skelly.deadvox.scenario.tutorial.play';
const GAUNTLET_MOD = 'skelly.deadvox.scenario.gauntlet.play';
// The launcher owns the start rows its links carry. Each site's row is its committed default start, which all
// share this kit.
const START_KIT = {
  kit: [
    { id: 'jeans', item: 'jeans', count: 1, condition: 0.7, destination: { kind: 'worn' } },
    { id: 'sneakers', item: 'sneakers', count: 1, condition: 0.8, destination: { kind: 'worn' } },
    { id: 'hoodie', item: 'hoodie', count: 1, condition: 0.8, destination: { kind: 'worn' } },
    { id: 'beans', item: 'canned_beans', destination: { kind: 'pocket', parent: 'hoodie', pocket: 0 } },
    { id: 'matches', item: 'matches', destination: { kind: 'pocket', parent: 'hoodie', pocket: 0 } },
    { id: 'bandages', item: 'bandage', count: 2, destination: { kind: 'pocket', parent: 'jeans', pocket: 2 } },
  ],
  wounds: [],
  skills: {},
  recipes: [
    'torch',
    'candle',
    'repair_kit',
    'repair_crowbar',
    'sawn_plank',
    'door_bar',
    'make_rope',
    'grind_kitchen_knife',
    'hone_kitchen_knife',
    'grind_kabar',
    'hone_kabar',
    'grind_machete',
    'hone_machete',
  ],
};
const SITE_STARTS = {
  gauntlet: {
    startTimeGameTimeOfDay: '10:00',
    placement: {
      template: 'gauntlet_start',
      cell: [0, 0],
      spawn: [22, 41, 4],
      minimumOpenDescents: 2,
      descents: [
        { kind: 'ladder', ladder: [39, 1, 10], lower: [41, 1, 11], upper: [36, 41, 11] },
        { kind: 'stairs', hatch: [10, 40, 5], lower: [14, 1, 1], upper: [18, 41, 6] },
        { kind: 'drop', edge: [5, 41, 8], landing: [5, 3, 8], lower: [5, 1, 14], upper: [6, 41, 8] },
      ],
      fixedLoot: [{ at: [35, 17, 6], items: [{ item: 'revolver_357', condition: 0.7, key: true }] }],
    },
  },
  city: { startTimeGameTimeOfDay: '10:00' },
  forest: { startTimeGameTimeOfDay: '10:00' },
  testHouse: { startTimeGameTimeOfDay: '10:00' },
  weatheringTest: { startTimeGameTimeOfDay: '12:00', debugOnly: true, allSkills: 10 },
};
// The game's `start-mod`: a mod whose one start row begins the run at `site` and `time`.
const launcherStartMod = (site, time) => ({
  id: 'site.launcher.start',
  version: '1',
  tier: 'scenario',
  product: false,
  dependencies: [],
  overrides: [],
  starts: [
    {
      id: `launcher_${site.toLowerCase()}`,
      site,
      seed: 1,
      storeys: 1,
      density: null,
      ...START_KIT,
      ...SITE_STARTS[site],
      startTimeGameTimeOfDay: time,
    },
  ],
});
// Each benchmark keeps its own workload, so its results stay comparable whatever the product's default start becomes:
// the shambler benchmark always runs in the forest at night, and the world benchmark without a chosen site runs the
// test house at noon, or the forest for a plan that mixes block sizes.
const startSite = (d) => {
  if (d.bench === 'shamblers') {
    return 'forest';
  }
  if (d.site !== '' && siteOffered(d, d.site)) {
    return d.site;
  }
  if (d.bench === '1') {
    return parsePlan(d.plan)?.some(([blockSize]) => Number(blockSize) !== 0.5) ? 'forest' : 'testHouse';
  }
  return DEFAULT_SITE;
};
const defaultTime = (d) => {
  if (d.bench === 'shamblers') {
    return '23:30';
  }
  if (d.bench === '1') {
    return '12:00';
  }
  return (SITE_STARTS[startSite(d)] ?? SITE_STARTS[DEFAULT_SITE]).startTimeGameTimeOfDay;
};
// A committed scenario at its own time goes through `mods`; any other site or time is a launcher start row.
const setStart = (p, d) => {
  const site = startSite(d);
  const mods = [...d.mods];
  if (site === 'tutorial') {
    mods.push(TUTORIAL_MOD);
  } else if (site === DEFAULT_SITE && d.time === SITE_STARTS[site].startTimeGameTimeOfDay) {
    if (d.site === DEFAULT_SITE) {
      mods.push(GAUNTLET_MOD);
    }
  } else {
    p.set('start-mod', JSON.stringify(launcherStartMod(site, d.time)));
  }
  if (d.bench === '') {
    setDefault(p, 'mods', mods.join(','), '');
  }
};
const parsePlan = (v) => {
  const rows = v.split(',').map((x) => x.split(':'));
  return rows.length > 0 &&
    rows.every(
      (r) => r.length === 2 && [0.25, 0.5, 1].includes(Number(r[0])) && Number(r[1]) >= 16 && Number(r[1]) <= 512,
    )
    ? rows
    : undefined;
};
const SHAMBLER_COUNTS_PATTERN = /^\d+(,\d+)*$/;
const parseCounts = (v) => {
  if (!SHAMBLER_COUNTS_PATTERN.test(v)) {
    return;
  }
  const a = v.split(',').map(Number);
  return a.every((n) => Number.isSafeInteger(n) && n > 0 && n <= 500) && new Set(a).size === a.length ? a : undefined;
};
const setDefault = (p, k, v, d) => {
  if (v !== d) {
    p.set(k, v);
  }
};
// Developer state goes in the game's hash. The static launcher cannot import the game's writer, so this writes
// the same form: see `packages/deadvox/src/hashState.ts`, `writeHash`. Callers add keys in `HASH_KEYS` order.
const BARE_HASH_TEXT = /^[A-Za-z0-9_.+#-]+$/;
const hashScalar = (value) =>
  typeof value !== 'string' || BARE_HASH_TEXT.test(value) ? String(value) : JSON.stringify(value);
const hashText = (hash) => {
  const entries = Object.entries(hash).map(
    ([key, value]) => `${key}:${Array.isArray(value) ? `[${value.map(hashScalar).join(',')}]` : hashScalar(value)}`,
  );
  return entries.length === 0 ? '' : `{${entries.join(',')}}`.replaceAll('%', '%25');
};
const setHashNumber = (hash, key, text) => {
  if (text.trim() !== '') {
    hash[key] = Number(text);
  }
};
const atNumbers = (text) =>
  text.trim() === '' ? [] : text.split(',').map((part) => (part.trim() === '' ? Number.NaN : Number(part)));
const addDebugParams = (hash, d) => {
  const at = atNumbers(d.at);
  if (at.length > 0) {
    hash.at = at;
  }
  if (enabled('focus', { deadvox: d }) && d.focus.trim() !== '') {
    hash.focus = d.focus.trim();
  }
  setHashNumber(hash, 'weathering', d.weathering);
  setHashNumber(hash, 'weatheringVariation', d.weatheringVariation);
  setHashNumber(hash, 'weatheringSplit', d.weatheringSplit);
  setHashNumber(hash, 'wobbleFlat', d.wobbleFlat);
};
const playHash = (d) => {
  const hash = d.debug ? { debug: true } : {};
  if (d.seed !== '1') {
    hash.seed = Number(d.seed);
  }
  if (d.radius !== '96') {
    hash.radius = Number(d.radius);
  }
  if (d.actors !== '') {
    hash.actors = d.actors;
  }
  if (d.debug) {
    addDebugParams(hash, d);
  }
  return hash;
};
// A bench run's settings, in the hash like the game's developer state.
const benchHash = (d) => {
  const hash = d.seed === '1' ? {} : { seed: Number(d.seed) };
  if (d.bench === '1') {
    if (d.plan !== '0.5:64,0.5:96,0.5:128') {
      hash.plan = d.plan.replaceAll(':', ',').split(',').map(Number);
    }
    if (d.worldIndex !== '0') {
      hash.i = Number(d.worldIndex);
    }
    if (d.quick) {
      hash.quick = true;
    }
    hash.shamblers = [Number(d.shamblers)];
  }
  if (d.bench === 'shamblers') {
    if (d.shamblerIndex !== '0') {
      hash.i = Number(d.shamblerIndex);
    }
    if (d.n !== '10,25,50,100') {
      hash.shamblers = d.n.split(',').map(Number);
    }
  }
  return hash;
};
const makeDeadvox = (d) => {
  const u = new URL('deadvox/', location.href);
  const p = u.searchParams;
  const m = d.bench;
  if (m) {
    p.set('bench', m);
  }
  if (m === 'report') {
    return u;
  }
  setStart(p, d);
  u.hash = hashText(m === '' ? playHash(d) : benchHash(d));
  return u;
};
const inRange = (value, min, max, integer = true) => {
  const number = Number(value);
  return (
    value !== '' && Number.isFinite(number) && number >= min && number <= max && (!integer || Number.isInteger(number))
  );
};
const validOptionalRange = (value, min, max) => value === '' || inRange(value, min, max, false);
const validWeatheringOverrides = (d) =>
  (!enabled('weathering', model) || validOptionalRange(d.weathering, 0, WEATHERING_STRENGTH_MAX)) &&
  (!enabled('weatheringVariation', model) || validOptionalRange(d.weatheringVariation, 0, 1)) &&
  (!enabled('weatheringSplit', model) || validOptionalRange(d.weatheringSplit, -256, 256));
const validAt = (text) => {
  const at = atNumbers(text);
  return (at.length === 0 || at.length === 2 || at.length === 3) && at.every(Number.isFinite);
};
const validDeadvox = (d) => {
  const plan = parsePlan(d.plan);
  const counts = parseCounts(d.n);
  return (
    (!enabled('at', model) || validAt(d.at)) &&
    (!enabled('seed', model) || inRange(d.seed, -2_147_483_648, 2_147_483_647)) &&
    (!enabled('time', model) || d.time !== '') &&
    (!enabled('radius', model) || inRange(d.radius, 32, 256)) &&
    validWeatheringOverrides(d) &&
    (!enabled('plan', model) || Boolean(plan)) &&
    (!enabled('worldIndex', model) || inRange(d.worldIndex, 0, (plan?.length ?? 1) - 1)) &&
    (!enabled('shamblers', model) || inRange(d.shamblers, 0, 500)) &&
    (!enabled('n', model) || Boolean(counts)) &&
    (!enabled('shamblerIndex', model) || inRange(d.shamblerIndex, 0, (counts?.length ?? 1) - 1))
  );
};
const refresh = () => {
  const d = model.deadvox;
  if (d.time === d.lastDefault) {
    d.time = defaultTime(d);
  }
  d.lastDefault = defaultTime(d);
  const dv = validDeadvox(d);
  d.url = dv ? makeDeadvox(d).href : '';
  d.status = dv ? '' : 'Correct the highlighted values to make a launch link.';
  renderPage();
};
const onInput = (e) => {
  const t = e.target;
  const m = model.deadvox;
  const mod = t.dataset.modId;
  if (mod) {
    m.mods = t.checked ? [...m.mods.filter((id) => id !== mod), mod] : m.mods.filter((id) => id !== mod);
    refresh();
    return;
  }
  const k = t.dataset.stateKey;
  if (!k) {
    return;
  }
  if (t.type === 'radio') {
    if (t.checked) {
      m[k] = t.value;
    }
  } else if (t.type === 'checkbox') {
    m[k] = t.checked;
  } else {
    m[k] = t.value;
  }
  if (!siteOffered(m, m.site)) {
    m.site = '';
  }
  refresh();
};
const onSubmit = (e) => {
  e.preventDefault();
  refresh();
  const m = model.deadvox;
  const valid = e.currentTarget.reportValidity();
  if (m.url && valid) {
    location.assign(m.url);
  }
};
const presets = {
  dusk: {
    bench: '',
    seed: '1',
    time: '19:30',
    radius: '96',
    site: '',
    debug: false,
  },
  noon: {
    bench: '',
    seed: '1',
    time: '12:00',
    radius: '96',
    site: '',
    debug: false,
  },
  night: {
    bench: '',
    seed: '1',
    time: '01:00',
    radius: '96',
    site: '',
    debug: false,
  },
  city: {
    bench: '',
    seed: '1',
    time: '19:30',
    radius: '96',
    site: 'city',
    debug: false,
  },
  gauntlet: {
    bench: '',
    seed: '1',
    time: '10:00',
    radius: '96',
    site: 'gauntlet',
    debug: false,
  },
  debug: {
    bench: '',
    seed: '1',
    time: '05:30',
    radius: '96',
    site: '',
    debug: true,
  },
  benchmark: {
    bench: '1',
    seed: '1',
    time: '12:00',
    radius: '96',
    site: '',
    debug: false,
  },
};
const onPreset = (e) => {
  const name = e.target.dataset?.deadvoxPreset;
  if (!name) {
    return;
  }
  Object.assign(model.deadvox, presets[name], {
    at: '',
    focus: '',
    lastDefault: '',
  });
  refresh();
};
const onCopy = async (e) => {
  const id = e.currentTarget.dataset.copy;
  const { url } = model.deadvox;
  if (!url) {
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    model.copied = id;
    renderPage();
    setTimeout(() => {
      model.copied = '';
      renderPage();
    }, 1200);
  } catch {
    model.copied = '';
  }
};
// The list is deadvox content published beside the game; without it the control is simply absent.
// It is a static page that cannot import the game's schema check, so it admits the list whole or not at all.
// Opt-in folder mods carry only their id, which is also their label.
const loadBundledMods = async (fetcher, url) => {
  try {
    const response = await fetcher(url);
    const { mods, folderMods = [] } = await response.json();
    const text = (value) => typeof value === 'string' && value.trim() !== '';
    const rows = Array.isArray(folderMods) ? folderMods.map((id) => ({ id, label: id, detail: id })) : undefined;
    const sound =
      response.ok &&
      Array.isArray(mods) &&
      rows !== undefined &&
      mods.every((mod) => mod && text(mod.id) && text(mod.label) && text(mod.detail)) &&
      folderMods.every(text) &&
      new Set([...mods, ...rows].map((mod) => mod.id)).size === mods.length + rows.length;
    return sound ? [...mods, ...rows] : [];
  } catch {
    return [];
  }
};
refresh();
loadBundledMods(fetch, new URL('deadvox/bundled-mods.json', location.href)).then((mods) => {
  model.bundledMods = mods;
  refresh();
});
