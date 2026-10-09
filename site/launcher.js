// biome-ignore lint/correctness/noUnresolvedImports: the browser loads this ESM module from jsDelivr.
import { html, render } from 'https://cdn.jsdelivr.net/npm/lit-html@3.3.3/+esm';

// Testers agree to this brief before they play, so it is the one place the consent wording lives.
const playtestBrief = html`
        <section class="playtest" aria-labelledby="playtest-title">
          <h3 id="playtest-title">Playtest</h3>
          <p><a id="deadvox-playtest" href="deadvox/?site=playtest">Play the playtest map</a>. Your task: find the military camp.</p>
          <ul>
            <li>The game records play metrics only on your machine, in this browser.</li>
            <li>Sending them is your choice: the F9 menu saves your metrics, and a replay of your recent play, as files you can attach to your feedback.</li>
            <li>This site, the game included, loads Simple Analytics to count visits. It gets none of your play metrics.</li>
            <li>Send feedback through <a href="https://github.com/roobie/skelly/issues/new?template=playtest-feedback.md">the playtest feedback form</a>. It opens a public GitHub issue and needs a GitHub account.</li>
            <li>If someone runs your session, they watch without helping and take notes. The notes go into a public playtest issue under a tester number, not your name. You can stop at any time.</li>
          </ul>
        </section>`;

const page = (state) => html`  <main>
      <h1>skelly</h1>
      <p class="lede">Low poly tools and a game.</p>

      <section class="card" aria-labelledby="deadvox-title">
        <div class="card-heading">
          <h2 id="deadvox-title"><a href="deadvox/">deadvox</a><span>(codename)</span></h2>
          <span>// working title = <code>Darker Yet -VOX-</code></span>
          <p>A singleplayer voxel survival prototype with data-driven content.</p>
        </div>
        ${playtestBrief}
        <form id="deadvox-form" @input=${onInput} @change=${onInput} @submit=${onSubmit}>
          <div class="form-grid">
            <label>Start mode
              <select name="bench" data-url-param="bench" id="deadvox-bench" data-state-key="bench" .value=${state.deadvox.bench} .disabled=${!enabled('deadvox', 'bench', state)}>
                <option value="">Play</option>
                <option value="1">World benchmark</option>
                <option value="shamblers">Shambler benchmark</option>
                <option value="report">Benchmark report</option>
              </select>
            </label>
            <div>
              <label id="deadvox-seed-field" ?hidden=${!visible('deadvox-seed-field', state)}>Seed
                <input name="seed" data-url-param="seed" type="number" step="1" min="-2147483648" max="2147483647" value="1" required  data-state-key="seed" .value=${state.deadvox.seed} .disabled=${!enabled('deadvox', 'seed', state)}/>
              </label>
              The seed is the starting value the random number generator uses to generate a sequence of seemingly random numbers. This means that a new seed will cause a completely 'new' world to be generated.
            </div>
            <label id="deadvox-time-field" ?hidden=${!visible('deadvox-time-field', state)}>Start time
              <input name="time" data-url-param="time" type="time" value="19:30" data-default-time="19:30" required  data-state-key="time" .value=${state.deadvox.time} .disabled=${!enabled('deadvox', 'time', state)}/>
            </label>
            <label id="deadvox-radius-field" ?hidden=${!visible('deadvox-radius-field', state)}>View distance (m)
              <input name="radius" data-url-param="radius" type="number" min="32" max="256" step="1" value="96" required  data-state-key="radius" .value=${state.deadvox.radius} .disabled=${!enabled('deadvox', 'radius', state)}/>
            </label>
            <label id="deadvox-site-field" ?hidden=${!visible('deadvox-site-field', state)}>Site
              <select name="site" data-url-param="site" id="deadvox-site" data-state-key="site" .value=${state.deadvox.site} .disabled=${!enabled('deadvox', 'site', state)}>
                <option id="deadvox-default-site" value="">${state.deadvox.bench === '1' ? 'Test house (benchmark default)' : 'Hamlet (default)'}</option>
                <option value="city">Stress-test city</option>
                <option value="forest">Forest (tree first look)</option>
                ${state.deadvox.debug && state.deadvox.bench === '' ? html`<option value="testHouse">Test house (debug)</option>` : ''}
              </select>
            </label>
            <label id="deadvox-storeys-field" ?hidden=${!visible('deadvox-storeys-field', state)}>Tallest city building (storeys)
              <input name="storeys" data-url-param="storeys" type="number" min="1" max="20" step="1" value="1" required  data-state-key="storeys" .value=${state.deadvox.storeys} .disabled=${!enabled('deadvox', 'storeys', state)}/>
            </label>
            <label id="deadvox-density-field" ?hidden=${!visible('deadvox-density-field', state)}>Forest fixed density (blank: seeded 0.2–0.75 field)
              <input name="density" data-url-param="density" type="number" min="0" max="1" step="0.05" value=""  data-state-key="density" .value=${state.deadvox.density} .disabled=${!enabled('deadvox', 'density', state)}/>
            </label>
            <label id="deadvox-actors-field" ?hidden=${!visible('deadvox-actors-field', state)}>Zombie models
              <select name="actors" data-url-param="actors" data-state-key="actors" .value=${state.deadvox.actors} .disabled=${!enabled('deadvox', 'actors', state)}>
                <option value="">Detailed (default)</option>
                <option value="boxes">Boxes</option>
              </select>
            </label>
            <label class="check" id="deadvox-debug-field" ?hidden=${!visible('deadvox-debug-field', state)}>
              <input name="debug" data-url-param="debug" type="checkbox" data-state-key="debug" .checked=${state.deadvox.debug} .disabled=${!enabled('deadvox', 'debug', state)}/> Enable development tools (?debug=1)
            </label>
            <label id="deadvox-loadout-field" ?hidden=${!visible('deadvox-loadout-field', state)}>Debug loadout
              <select name="loadout" data-url-param="loadout" data-state-key="loadout" .value=${state.deadvox.loadout} .disabled=${!enabled('deadvox', 'loadout', state)}>
                <option value="">None</option>
                <option value="pump">Pump</option>
                <option value="ar">AR</option>
                <option value="ak">AK</option>
              </select>
            </label>
            <label id="deadvox-at-field" ?hidden=${!visible('deadvox-at-field', state)}>Debug start position (m): x,z[,yaw°]
              <input name="at" data-url-param="at" type="text" placeholder="x,z[,yaw]" autocomplete="off"  data-state-key="at" .value=${state.deadvox.at} .disabled=${!enabled('deadvox', 'at', state)}/>
            </label>
            <label id="deadvox-handedness-field" ?hidden=${!visible('deadvox-handedness-field', state)}>Debug dominant hand
              <select name="handedness" data-url-param="handedness" data-state-key="handedness" .value=${state.deadvox.handedness} .disabled=${!enabled('deadvox', 'handedness', state)}>
                <option value="">Start-card choice</option>
                <option value="left">Left</option>
              </select>
            </label>
            <label id="deadvox-wobble-flat-field" ?hidden=${!visible('deadvox-wobble-flat-field', state)}>Debug wobble vertical/horizontal ratio (blank: content default)
              <input name="wobbleFlat" data-url-param="wobbleFlat" type="number" min="0" max="1" step="any" placeholder="content default"  data-state-key="wobbleFlat" .value=${state.deadvox.wobbleFlat} .disabled=${!enabled('deadvox', 'wobbleFlat', state)}/>
            </label>
          </div>

          <div id="deadvox-world-bench" ?hidden=${!visible('deadvox-world-bench', state)}>
            <hr class="section-divider" />
            <h3>World benchmark</h3>
            <div class="form-grid">
              <label>Benchmark plan (block size:radius m, comma-separated)
                <input name="plan" data-url-param="plan" type="text" value="0.5:64,0.5:96,0.5:128" autocomplete="off" required  data-state-key="plan" .value=${state.deadvox.plan} .disabled=${!enabled('deadvox', 'plan', state)}/>
              </label>
              <label>Start at plan entry
                <input id="deadvox-world-index" name="i" data-url-param="i" type="number" min="0" step="1" value="0" required  data-state-key="worldIndex" .value=${state.deadvox.worldIndex} .disabled=${!enabled('deadvox', 'worldIndex', state)}/>
              </label>
              <label>Detailed shamblers (0 disables them)
                <input name="shamblers" data-url-param="shamblers" type="number" min="0" max="500" step="1" value="60" required  data-state-key="shamblers" .value=${state.deadvox.shamblers} .disabled=${!enabled('deadvox', 'shamblers', state)}/>
              </label>
              <label class="check">
                <input name="quick" data-url-param="quick" type="checkbox"  data-state-key="quick" .checked=${state.deadvox.quick} .disabled=${!enabled('deadvox', 'quick', state)}/> Quick check (short, not a result)
              </label>
              <p class="muted">Plan block sizes: 0.25, 0.5 or 1 m; radius: 16–512 m per entry. Time defaults to noon.</p>
            </div>
          </div>

          <div id="deadvox-shambler-bench" ?hidden=${!visible('deadvox-shambler-bench', state)}>
            <hr class="section-divider" />
            <h3>Shambler benchmark</h3>
            <div class="form-grid">
              <label>Shambler counts (unique integers, 1–500)
                <input name="n" data-url-param="n" type="text" value="10,25,50,100" inputmode="numeric" autocomplete="off" required  data-state-key="n" .value=${state.deadvox.n} .disabled=${!enabled('deadvox', 'n', state)}/>
              </label>
              <label>Start at count entry
                <input id="deadvox-shambler-index" name="i" data-url-param="i" type="number" min="0" step="1" value="0" required  data-state-key="shamblerIndex" .value=${state.deadvox.shamblerIndex} .disabled=${!enabled('deadvox', 'shamblerIndex', state)}/>
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
          <button type="button" data-deadvox-preset="debug">Debug before dawn</button>
          <button type="button" data-deadvox-preset="benchmark">Benchmark</button>
        </fieldset>
        <p class="status">Debug tools and their current keys are documented in-game.</p>
      </section>

      <section class="card" aria-labelledby="gungen-title">
        <div class="card-heading">
          <h2 id="gungen-title"><a href="gungen/">gungen</a></h2>
          <p>A super-low-poly firearm generator. Generate from a template, open a validation fixture, or view a curated design.</p>
        </div>
        <form id="gungen-form" @input=${onInput} @change=${onInput} @submit=${onSubmit}>
          <fieldset class="choice-row">
            <legend class="sr-only">Gungen starting point</legend>
            <label><input type="radio" name="gungen-mode" value="template" checked  data-state-key="mode" .checked=${state.gungen.mode === 'template'} .disabled=${!enabled('gungen', 'mode', state)}/> Generate template</label>
            <label><input type="radio" name="gungen-mode" value="fixture"  data-state-key="mode" .checked=${state.gungen.mode === 'fixture'} .disabled=${!enabled('gungen', 'mode', state)}/> Open fixture</label>
            <label><input type="radio" name="gungen-mode" value="design"  data-state-key="mode" .checked=${state.gungen.mode === 'design'} .disabled=${!enabled('gungen', 'mode', state)}/> Open design</label>
          </fieldset>
          <div id="gungen-template-fields" class="form-grid" ?hidden=${!visible('gungen-template-fields', state)}>
            <label>Seed
              <input name="seed" data-url-param="seed" type="number" step="1" min="-2147483648" max="2147483647" value="0" required  data-state-key="seed" .value=${state.gungen.seed} .disabled=${!enabled('gungen', 'seed', state)}/>
            </label>
            <p class="muted">The viewer has controls to step seeds and search for a valid build.</p>
          </div>
          <div id="gungen-fixture-fields" class="form-grid" ?hidden=${!visible('gungen-fixture-fields', state)}>
            <p class="muted">Fixtures show the assembly and its expected validation result.</p>
          </div>
          <div id="gungen-design-fields" class="form-grid" ?hidden=${!visible('gungen-design-fields', state)}>
            <p class="muted">Designs open read-only metadata with in-memory parameter editing in the viewer.</p>
          </div>
          <div class="form-grid">
            <label>Overrides (optional)
              <input name="set" data-url-param="set" id="gungen-set" type="text" placeholder="magazine.variant:akm,rear-sight:off" spellcheck="false"  data-state-key="set" .value=${state.gungen.set} .disabled=${!enabled('gungen', 'set', state)}/>
            </label>
            <p class="muted">Param overrides and optional parts, as the viewer's panel writes them.</p>
          </div>
          <div class="action-row">
            <button class="primary" type="submit">Open viewer</button>
          </div>
          <label class="url-label" for="gungen-url">Direct link</label>
          <div class="url-row">
            <input id="gungen-url" .value=${state.gungen.url} type="text" readonly aria-label="Composed gungen URL" />
            <button type="button" data-copy="gungen-url" @click=${onCopy}>${state.copied === 'gungen-url' ? 'Copied' : 'Copy link'}</button>
          </div>
          <p id="gungen-status" class="status" role="status" aria-live="polite">${state.gungen.status}</p>
        </form>
      </section>

      <section class="card">
        <h2><a href="mobgen/">mobgen</a></h2>
        <p>
          A procedural generator of detailed voxel mobile actors (zombies and other NPCs) for deadvox, built up
          from small voxels and a validated pipeline, with a procedural walk cycle. Milestone 1 is in progress.
        </p>
        <ul class="links">
          <li><a href="mobgen/">Open the viewer</a></li>
          <li><a href="mobgen/?template=shambler&amp;seed=7">Generated shambler</a></li>
          <li><a href="mobgen/?template=runner&amp;seed=0">Generated runner</a></li>
          <li><a href="mobgen/?template=brute&amp;seed=11">Generated brute</a></li>
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
    storeys: '3',
    density: '',
    actors: '',
    debug: false,
    loadout: '',
    at: '',
    handedness: '',
    wobbleFlat: '',
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
  gungen: {
    mode: 'template',
    seed: '0',
    set: '',
    url: '',
    status: '',
  },
  copied: '',
};
const root = document.body.firstElementChild;
const renderPage = () => render(page(model), root);
const visibility = {
  'deadvox-seed-field': (d) => d.bench !== 'report',
  'deadvox-time-field': (d) => d.bench !== 'report',
  'deadvox-radius-field': (d) => d.bench === '',
  'deadvox-site-field': (d) => d.bench !== 'report' && d.bench !== 'shamblers',
  'deadvox-storeys-field': (d) => d.site === 'city' && d.bench !== 'report' && d.bench !== 'shamblers',
  'deadvox-density-field': (d) => d.site === 'forest' && d.bench !== 'report' && d.bench !== 'shamblers',
  'deadvox-actors-field': (d) => d.bench === '',
  'deadvox-debug-field': (d) => d.bench === '',
  'deadvox-loadout-field': (d) => d.bench === '' && d.debug,
  'deadvox-at-field': (d) => d.bench === '' && d.debug,
  'deadvox-handedness-field': (d) => d.bench === '' && d.debug,
  'deadvox-wobble-flat-field': (d) => d.bench === '' && d.debug,
  'deadvox-world-bench': (d) => d.bench === '1',
  'deadvox-shambler-bench': (d) => d.bench === 'shamblers',
  'gungen-template-fields': (_, g) => g.mode === 'template',
  'gungen-fixture-fields': (_, g) => g.mode === 'fixture',
  'gungen-design-fields': (_, g) => g.mode === 'design',
};
const visible = (id, s) => (visibility[id] ? visibility[id](s.deadvox, s.gungen) : true);
const gungenControlVisibility = {
  fixture: 'gungen-fixture-fields',
  design: 'gungen-design-fields',
  template: 'gungen-template-fields',
  seed: 'gungen-template-fields',
};
const deadvoxControlVisibility = {
  seed: 'deadvox-seed-field',
  time: 'deadvox-time-field',
  radius: 'deadvox-radius-field',
  site: 'deadvox-site-field',
  storeys: 'deadvox-storeys-field',
  density: 'deadvox-density-field',
  actors: 'deadvox-actors-field',
  debug: 'deadvox-debug-field',
  loadout: 'deadvox-loadout-field',
  at: 'deadvox-at-field',
  handedness: 'deadvox-handedness-field',
  wobbleFlat: 'deadvox-wobble-flat-field',
  plan: 'deadvox-world-bench',
  shamblers: 'deadvox-world-bench',
  worldIndex: 'deadvox-world-bench',
  quick: 'deadvox-world-bench',
  n: 'deadvox-shambler-bench',
  shamblerIndex: 'deadvox-shambler-bench',
};
const enabled = (form, key, s) => {
  const fields = form === 'gungen' ? gungenControlVisibility : deadvoxControlVisibility;
  return fields[key] ? visible(fields[key], s) : true;
};
const defaultTime = (d) => {
  if (d.bench === 'shamblers') {
    return '23:30';
  }
  if (d.bench === '1') {
    return '12:00';
  }
  return '10:00';
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
const addDebugParams = (params, d) => {
  params.set('debug', '1');
  setDefault(params, 'at', d.at.trim(), '');
  setDefault(params, 'handedness', d.handedness, '');
  setDefault(params, 'wobbleFlat', d.wobbleFlat.trim(), '');
  setDefault(params, 'loadout', d.loadout, '');
  if (d.site === 'testHouse') {
    params.set('site', 'testHouse');
  }
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
  setDefault(p, 'seed', d.seed, '1');
  setDefault(p, 'time', d.time, defaultTime(d));
  if (m === '') {
    setDefault(p, 'radius', d.radius, '96');
    setDefault(p, 'actors', d.actors, '');
    if (d.debug) {
      addDebugParams(p, d);
    }
  }
  if ((m === '' || m === '1') && d.site === 'city') {
    p.set('site', 'city');
    setDefault(p, 'storeys', d.storeys, '1');
  }
  if (d.site === 'forest') {
    p.set('site', 'forest');
    setDefault(p, 'density', d.density, '');
  }
  if (m === '1') {
    p.set('shamblers', d.shamblers);
    setDefault(p, 'plan', d.plan, '0.5:64,0.5:96,0.5:128');
    setDefault(p, 'i', d.worldIndex, '0');
    if (d.quick) {
      p.set('quick', '1');
    }
  }
  if (m === 'shamblers') {
    setDefault(p, 'n', d.n, '10,25,50,100');
    setDefault(p, 'i', d.shamblerIndex, '0');
  }
  return u;
};
const makeGungen = (g) => {
  const u = new URL('gungen/', location.href);
  const p = u.searchParams;
  if (g.mode === 'fixture') {
    p.set('fixture', 'ak-standard-handguard');
  } else if (g.mode === 'design') {
    p.set('design', 'archetype-ak-akm');
  } else {
    p.set('template', 'battle-rifle');
    setDefault(p, 'seed', g.seed, '0');
  }
  setDefault(p, 'set', g.set.trim(), '');
  return u;
};
const inRange = (value, min, max, integer = true) => {
  const number = Number(value);
  return (
    value !== '' && Number.isFinite(number) && number >= min && number <= max && (!integer || Number.isInteger(number))
  );
};
const validDeadvox = (d) => {
  const plan = parsePlan(d.plan);
  const counts = parseCounts(d.n);
  return (
    (!enabled('deadvox', 'seed', model) || inRange(d.seed, -2_147_483_648, 2_147_483_647)) &&
    (!enabled('deadvox', 'time', model) || d.time !== '') &&
    (!enabled('deadvox', 'radius', model) || inRange(d.radius, 32, 256)) &&
    (!enabled('deadvox', 'storeys', model) || inRange(d.storeys, 1, 20)) &&
    (!enabled('deadvox', 'density', model) || d.density === '' || inRange(d.density, 0, 1, false)) &&
    (!enabled('deadvox', 'plan', model) || Boolean(plan)) &&
    (!enabled('deadvox', 'worldIndex', model) || inRange(d.worldIndex, 0, (plan?.length ?? 1) - 1)) &&
    (!enabled('deadvox', 'shamblers', model) || inRange(d.shamblers, 0, 500)) &&
    (!enabled('deadvox', 'n', model) || Boolean(counts)) &&
    (!enabled('deadvox', 'shamblerIndex', model) || inRange(d.shamblerIndex, 0, (counts?.length ?? 1) - 1))
  );
};
const refresh = (form) => {
  const d = model.deadvox;
  const g = model.gungen;
  if (form === 'deadvox' && d.time === d.lastDefault) {
    d.time = defaultTime(d);
  }
  d.lastDefault = defaultTime(d);
  const dv = validDeadvox(d);
  d.url = dv ? makeDeadvox(d).href : '';
  d.status = dv ? '' : 'Correct the highlighted values to make a launch link.';
  const gv =
    g.mode !== 'template' ||
    (g.seed !== '' &&
      Number.isInteger(Number(g.seed)) &&
      Number(g.seed) >= -2_147_483_648 &&
      Number(g.seed) <= 2_147_483_647);
  g.url = gv ? makeGungen(g).href : '';
  g.status = gv ? '' : 'Enter a whole-number seed in range to make a launch link.';
  renderPage();
};
const onInput = (e) => {
  const f = e.currentTarget.id === 'deadvox-form' ? 'deadvox' : 'gungen';
  const t = e.target;
  const k = t.dataset.stateKey;
  if (!k) {
    return;
  }
  const m = model[f];
  if (t.type === 'radio') {
    if (t.checked) {
      m[k] = t.value;
    }
  } else if (t.type === 'checkbox') {
    m[k] = t.checked;
    if (f === 'deadvox' && k === 'debug' && !t.checked && m.site === 'testHouse') {
      m.site = '';
    }
  } else {
    m[k] = t.value;
  }
  refresh(f);
};
const onSubmit = (e) => {
  e.preventDefault();
  const f = e.currentTarget.id === 'deadvox-form' ? 'deadvox' : 'gungen';
  refresh(f);
  const m = model[f];
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
    storeys: '1',
    debug: false,
  },
  noon: {
    bench: '',
    seed: '1',
    time: '12:00',
    radius: '96',
    site: '',
    storeys: '1',
    debug: false,
  },
  night: {
    bench: '',
    seed: '1',
    time: '01:00',
    radius: '96',
    site: '',
    storeys: '1',
    debug: false,
  },
  city: {
    bench: '',
    seed: '1',
    time: '19:30',
    radius: '96',
    site: 'city',
    storeys: '5',
    debug: false,
  },
  debug: {
    bench: '',
    seed: '1',
    time: '05:30',
    radius: '96',
    site: '',
    storeys: '1',
    debug: true,
  },
  benchmark: {
    bench: '1',
    seed: '1',
    time: '12:00',
    radius: '96',
    site: '',
    storeys: '1',
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
    loadout: '',
    lastDefault: '',
  });
  refresh('deadvox');
};
const onCopy = async (e) => {
  const id = e.currentTarget.dataset.copy;
  const formState = model[id === 'deadvox-url' ? 'deadvox' : 'gungen'];
  if (!formState.url) {
    return;
  }
  try {
    await navigator.clipboard.writeText(formState.url);
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
refresh('deadvox');
refresh('gungen');
