import { html, render } from 'lit-html';

export function createSkyRoutePanel(launchUrl: string) {
  const root = document.getElementById('sky-route-root')!;
  const state = {
    progress: 'Sky route armed. Click Play; do not move the mouse. Escape stops the route.',
    launch: true,
    summary: '',
    json: '',
    expanded: false,
  };
  const copy = () => {
    state.expanded = true;
    draw();
    root.querySelector<HTMLTextAreaElement>('textarea')!.select();
    navigator.clipboard?.writeText(state.json).catch(() => {
      state.progress = 'JSON selected; copy with the browser clipboard shortcut.';
      draw();
    });
  };
  const draw = () =>
    render(
      html`
  <section data-sky-route style="position:fixed;right:8px;top:8px;z-index:var(--ui-layer-review-map);max-width:38em;background:#121820e8;color:white;padding:10px;font:13px monospace;pointer-events:auto">
   <div>${state.progress}</div>
   <a href=${launchUrl} ?hidden=${!state.launch}>Launch the controlled camp route</a>
   <pre style="white-space:pre-wrap">${state.summary}</pre>
   <button type="button" ?hidden=${!state.json} @click=${copy}>Copy JSON</button>
   <textarea readonly aria-label="Sky route evidence JSON" ?hidden=${!state.expanded} .value=${state.json} style="width:100%;height:8em"></textarea>
  </section>`,
      root,
    );
  draw();
  return {
    progress: (text: string) => {
      state.progress = text;
      draw();
    },
    started: () => {
      state.launch = false;
      draw();
    },
    complete: (summary: string, json: string) => {
      state.summary = summary;
      state.json = json;
      draw();
    },
  };
}
