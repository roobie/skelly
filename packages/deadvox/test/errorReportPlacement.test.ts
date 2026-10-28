// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { installErrorReportHandler } from '../src/ui/errorReport.ts';

const rect = (left: number, width: number): DOMRect =>
  ({ left, right: left + width, width, top: 0, bottom: 0, height: 0, x: left, y: 0, toJSON: () => ({}) }) as DOMRect;

describe('error panel fact placement', () => {
  it('places a static error-panel fact on focus without any factDetail() call', () => {
    document.body.innerHTML = `
      <a id="playtest-feedback" href="https://github.com/roobie/skelly/issues/new"></a>
      <section id="error-report" hidden>
        <h2 id="error-report-title" tabindex="-1"></h2>
        <div id="host">
          <span class="fact-detail"><button data-error-download>Download error report</button><span class="fact-detail-copy" role="tooltip">Report contents.</span></span>
        </div>
        <pre data-error-text></pre>
        <button data-error-copy></button>
        <a data-error-download-link></a><a data-error-feedback></a><p data-error-status></p>
      </section>`;
    const host = document.getElementById('host')!;
    const owner = document.querySelector<HTMLElement>('.fact-detail')!;
    const copy = document.querySelector<HTMLElement>('.fact-detail-copy')!;
    Object.defineProperty(host, 'clientWidth', { value: 100 });
    vi.spyOn(host, 'getBoundingClientRect').mockReturnValue(rect(0, 100));
    vi.spyOn(owner, 'getBoundingClientRect').mockReturnValue(rect(200, 40));
    vi.spyOn(copy, 'getBoundingClientRect').mockReturnValue(rect(200, 300));
    installErrorReportHandler();

    document.querySelector<HTMLElement>('[data-error-download]')!.focus();
    expect(copy.style.maxWidth).toBe('100px');
    expect(copy.style.getPropertyValue('--fact-detail-shift')).toBe('-200px');
  });
});
