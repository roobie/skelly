// The results page shown after the last run: a table, the environment, and buttons
// to copy the results as Markdown (for SLICE-1.md) or JSON.

import type { BenchRecord, RunResult } from './plan.ts';

const MIB = 1024 * 1024;
const f = (n: number, digits = 1): string => (Number.isFinite(n) ? n.toFixed(digits) : '–');
const pct = (fraction: number): string => (Number.isFinite(fraction) ? `${Math.round(fraction * 100)}%` : '–');
const mib = (bytes: number): string => f(bytes / MIB);

export const HEADERS = [
  'Block',
  'Radius',
  'Load s',
  'Chunks',
  'MiB held / if full / palette',
  'Mesh ms p50 / p95',
  'Tris per chunk p50',
  'Look fps / p95 ms / slow',
  'Draws',
  'Jog p95 ms / slow / holes',
  'Sprint p95 ms / slow / holes',
  'Work ms p95 look / jog / sprint',
] as const;

export const resultRow = (r: RunResult): string[] => [
  `${r.blockSize} m`,
  `${r.radiusM} m`,
  `${f(r.load.seconds)}${r.load.timedOut ? ' (timed out)' : ''}`,
  String(r.memory.chunks),
  `${mib(r.memory.bytesStored)} / ${mib(r.memory.bytesFull)} / ${mib(r.memory.bytesPalette)}`,
  `${f(r.meshMs.median)} / ${f(r.meshMs.p95)}`,
  f(r.meshTriangles.median, 0),
  `${f(r.look.fpsMean, 0)} / ${f(r.look.msP95)} / ${pct(r.look.slowFraction)}`,
  f(r.look.drawCalls, 0),
  `${f(r.jog.msP95)} / ${pct(r.jog.slowFraction)} / ${r.jog.holesMax}`,
  `${f(r.sprint.msP95)} / ${pct(r.sprint.slowFraction)} / ${r.sprint.holesMax}${r.interrupted ? ' ⚠' : ''}`,
  `${f(r.look.work.p95)} / ${f(r.jog.work.p95)} / ${f(r.sprint.work.p95)}`,
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
  ];
};

export const markdownReport = (record: BenchRecord): string =>
  [markdownTable(record), '', ...environmentLines(record).map((l) => `- ${l}`)].join('\n');

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

export const showReport = (card: HTMLElement, record: BenchRecord | undefined): void => {
  card.classList.add('report');
  if (!record || record.runs.length === 0) {
    card.replaceChildren(element('h1', 'No benchmark results'), element('p', 'Run the benchmark first.'));
    return;
  }
  const table = element('table');
  const head = table.createTHead().insertRow();
  for (const h of HEADERS) {
    head.append(element('th', h));
  }
  const body = table.createTBody();
  for (const r of record.runs) {
    const row = body.insertRow();
    for (const cell of resultRow(r)) {
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
  for (const l of environmentLines(record)) {
    env.append(element('li', l));
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
      'Paste the Markdown back. "Slow" is the share of frames over 18 ms; "holes" is the most nearby columns still unmeshed at once; "work" is CPU time per frame (streaming, simulation, submitting the render), out of the 16.7 ms a 60 fps frame has.',
    ),
    table,
    env,
    buttons,
    status,
    text,
  );
};
