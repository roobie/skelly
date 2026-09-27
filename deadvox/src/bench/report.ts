// The results page shown after the last run: a table, the environment, and buttons
// to copy the results as Markdown (for SLICE-1.md) or JSON.

import type { BenchRecord, RunResult, ShamblerRunResult } from './plan.ts';

const MIB = 1024 * 1024;
const f = (n: number, digits = 1): string => (Number.isFinite(n) ? n.toFixed(digits) : '–');
const pct = (fraction: number): string => (Number.isFinite(fraction) ? `${Math.round(fraction * 100)}%` : '–');
const mib = (bytes: number): string => f(bytes / MIB);

export const SHAMBLER_HEADERS = [
  'N',
  'Seed',
  'Frame ms p50 / p95 / slow fraction',
  'Zombie tick CPU ms p50 / p95',
  'Render-submit ms p50 / p95',
  'Holes max / fraction',
  'Interrupted',
] as const;

export const HEADERS = [
  'Block',
  'Radius',
  'Load s',
  'Chunks',
  'MiB held / if full / palette',
  'Mesh ms p50 / p95',
  'Tris per chunk p50',
  'Look fps / p95 ms / slow',
  'Draws / k tris',
  'Jog p95 ms / slow / holes',
  'Sprint p95 ms / slow / holes',
  'Work ms p95 look / jog / sprint',
  'Render ms p50 / p95',
] as const;

export const shamblerResultRow = (r: ShamblerRunResult): string[] => [
  String(r.n),
  String(r.seed),
  `${f(r.frame.msMedian)} / ${f(r.frame.msP95)} / ${pct(r.frame.slowFraction)}`,
  `${f(r.zombieTick.median)} / ${f(r.zombieTick.p95)}`,
  `${f(r.renderSubmit.median)} / ${f(r.renderSubmit.p95)}`,
  `${r.holesMax} / ${pct(r.holeFraction)}`,
  r.interrupted ? 'yes' : 'no',
];

export const shamblerSummary = (runs: readonly ShamblerRunResult[]): string =>
  runs
    .map(
      (r) =>
        `N=${r.n} seed=${r.seed}: frame ${f(r.frame.msMedian)}/${f(r.frame.msP95)} ms p50/p95, ${pct(r.frame.slowFraction)} >18 ms; ZombieSystem ${f(r.zombieTick.median)}/${f(r.zombieTick.p95)} ms p50/p95; render-submit ${f(r.renderSubmit.median)}/${f(r.renderSubmit.p95)} ms p50/p95; holes ${r.holesMax} max (${pct(r.holeFraction)} frames)${r.interrupted ? ' [INTERRUPTED]' : ''}`,
    )
    .join(' | ');

export const resultRow = (r: RunResult): string[] => [
  `${r.blockSize} m`,
  `${r.radiusM} m`,
  `${f(r.load.seconds)}${r.load.timedOut ? ' (timed out)' : ''}`,
  String(r.memory.chunks),
  `${mib(r.memory.bytesStored)} / ${mib(r.memory.bytesFull)} / ${mib(r.memory.bytesPalette)}`,
  `${f(r.meshMs.median)} / ${f(r.meshMs.p95)}`,
  f(r.meshTriangles.median, 0),
  `${f(r.look.fpsMean, 0)} / ${f(r.look.msP95)} / ${pct(r.look.slowFraction)}`,
  `${f(r.look.drawCalls, 0)} / ${f(r.look.triangles / 1000, 0)}`,
  `${f(r.jog.msP95)} / ${pct(r.jog.slowFraction)} / ${r.jog.holesMax}`,
  `${f(r.sprint.msP95)} / ${pct(r.sprint.slowFraction)} / ${r.sprint.holesMax}${r.interrupted ? ' ⚠' : ''}`,
  `${f(r.look.work.p95)} / ${f(r.jog.work.p95)} / ${f(r.sprint.work.p95)}`,
  r.render ? `${f(r.render.median)} / ${f(r.render.p95)}` : '–',
];

export const markdownTable = (record: BenchRecord): string => {
  const line = (cells: readonly string[]) => `| ${cells.join(' | ')} |`;
  return [line(HEADERS), line(HEADERS.map(() => '---')), ...record.runs.map((r) => line(resultRow(r)))].join('\n');
};

const environmentLines = (record: BenchRecord): string[] => {
  const { env } = record;
  if (!env) {
    return ['Environment: not recorded'];
  }
  return [
    `GPU: ${env.gpu}`,
    `CPU threads: ${env.cores}${env.deviceMemory === undefined ? '' : `, memory ≥ ${env.deviceMemory} GiB`}`,
    `Canvas: ${env.canvas} at pixel ratio ${env.pixelRatio}`,
    `Browser: ${env.userAgent}`,
    `Run: ${record.startedAt}${record.quick ? ' (quick mode: not valid results)' : ''}`,
    `Site: ${record.site ?? 'test house'}`,
    `Time: ${record.time ?? '12:00'}`,
  ];
};

export const markdownReport = (record: BenchRecord): string => {
  if (record.shamblers?.length) {
    const line = (cells: readonly string[]) => `| ${cells.join(' | ')} |`;
    const table = [
      line(SHAMBLER_HEADERS),
      line(SHAMBLER_HEADERS.map(() => '---')),
      ...record.shamblers.map((r) => line(shamblerResultRow(r))),
    ].join('\n');
    return [
      table,
      '',
      `Shambler summary: ${shamblerSummary(record.shamblers)}`,
      '',
      ...environmentLines(record).map((l) => `- ${l}`),
    ].join('\n');
  }
  return [markdownTable(record), '', ...environmentLines(record).map((l) => `- ${l}`)].join('\n');
};

const element = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] => {
  const el = document.createElement(tag);
  if (text !== undefined) {
    el.textContent = text;
  }
  return el;
};

const copyButton = (label: string, text: string, status: HTMLElement): HTMLButtonElement => {
  const button = element('button', label);
  button.type = 'button';
  button.addEventListener('click', () => {
    navigator.clipboard.writeText(text).then(
      () => {
        status.textContent = `${label}: copied.`;
      },
      () => {
        status.textContent = 'Copying was blocked; select the text below instead.';
      },
    );
  });
  return button;
};

const showShamblerReport = (card: HTMLElement, record: BenchRecord): void => {
  const results = record.shamblers!;
  const table = element('table');
  const head = table.createTHead().insertRow();
  for (const h of SHAMBLER_HEADERS) {
    head.append(element('th', h));
  }
  const body = table.createTBody();
  for (const result of results) {
    const row = body.insertRow();
    for (const cell of shamblerResultRow(result)) {
      row.insertCell().textContent = cell;
    }
  }
  const markdown = markdownReport(record);
  const summaryText = shamblerSummary(results);
  const status = element('p');
  status.className = 'status';
  const text = element('textarea');
  text.readOnly = true;
  text.value = markdown;
  const again = element('a', 'Run shambler benchmark again');
  again.href = '?bench=shamblers';
  const play = element('a', 'Play');
  play.href = './';
  const env = element('ul');
  for (const line of environmentLines(record)) {
    env.append(element('li', line));
  }
  const buttons = element('div');
  buttons.className = 'buttons';
  buttons.append(
    copyButton('Copy summary', summaryText, status),
    copyButton('Copy Markdown', markdown, status),
    copyButton('Copy JSON', JSON.stringify(record, null, 2), status),
    again,
    play,
  );
  card.replaceChildren(
    element('h1', 'Shambler benchmark results'),
    element(
      'p',
      'Frame times are wall-clock intervals; slow frames are over 18 ms. ZombieSystem tick and render-submit are CPU timings. Holes are nearby unmeshed columns.',
    ),
    table,
    element('h2', 'One-line summary'),
    element('pre', summaryText),
    env,
    buttons,
    status,
    text,
  );
};

const showWorldReport = (card: HTMLElement, record: BenchRecord): void => {
  const table = element('table');
  const head = table.createTHead().insertRow();
  for (const h of HEADERS) {
    head.append(element('th', h));
  }
  const body = table.createTBody();
  for (const result of record.runs) {
    const row = body.insertRow();
    for (const cell of resultRow(result)) {
      row.insertCell().textContent = cell;
    }
  }
  const markdown = markdownReport(record);
  const status = element('p');
  status.className = 'status';
  const text = element('textarea');
  text.readOnly = true;
  text.value = markdown;
  const again = element('a', 'Run again');
  again.href = '?bench=1';
  const play = element('a', 'Play');
  play.href = './';
  const env = element('ul');
  for (const line of environmentLines(record)) {
    env.append(element('li', line));
  }
  const buttons = element('div');
  buttons.className = 'buttons';
  buttons.append(
    copyButton('Copy Markdown', markdown, status),
    copyButton('Copy JSON', JSON.stringify(record, null, 2), status),
    again,
    play,
  );
  card.replaceChildren(
    element('h1', 'Benchmark results'),
    element(
      'p',
      'Paste the Markdown back. "Slow" is the share of frames over 18 ms; "holes" is the most nearby columns still unmeshed at once; "work" is CPU time per frame (streaming, simulation, submitting the render), out of the 16.7 ms a 60 fps frame has; "render" is the render call plus waiting for the GPU to draw it.',
    ),
    table,
    env,
    buttons,
    status,
    text,
  );
};

export const showReport = (card: HTMLElement, record: BenchRecord | undefined): void => {
  card.classList.add('report');
  if (!record || (record.runs.length === 0 && !record.shamblers?.length)) {
    card.replaceChildren(element('h1', 'No benchmark results'), element('p', 'Run the benchmark first.'));
  } else if (record.shamblers?.length) {
    showShamblerReport(card, record);
  } else {
    showWorldReport(card, record);
  }
};
