import { html, render } from 'lit-html';
import {
  bindingIsDebugOnly,
  contextsForRun,
  inputBindings,
  keyboardInput,
  NATIVE_EDITING,
  NATIVE_INPUTS,
} from '../game/inputBindings.ts';

export const mountInputOptions = (root: HTMLElement, debugRun = false): void => {
  let capture: { id: string; alternative: number } | undefined;
  let status = '';
  const stop = () => {
    capture = undefined;
    keyboardInput.capture = undefined;
    draw();
  };
  const start = (id: string, alternative: number) => {
    keyboardInput.cancel();
    capture = { id, alternative };
    status = '';
    keyboardInput.capture = (chord) => {
      if (!capture) {
        return;
      }
      if (!chord) {
        stop();
        return;
      }
      if (typeof chord === 'string') {
        status = chord;
        draw();
        return;
      }
      const chords = [...inputBindings.chords(capture.id)];
      chords[capture.alternative] = chord;
      const issue = inputBindings.rebind(capture.id, chords, debugRun);
      status = issue ?? 'Binding saved';
      if (issue) {
        draw();
      } else {
        stop();
      }
    };
    draw();
  };
  const bindings = inputBindings.bindings.filter((binding) => debugRun || !bindingIsDebugOnly(binding));
  const contexts = [...new Set(bindings.flatMap((binding) => contextsForRun(binding, debugRun)))];
  const draw = () => {
    render(
      html`
      <details class="input-options"><summary>Input bindings</summary>
        <p>${NATIVE_EDITING}</p>
        <p>Bindings are preferences for this browser, not part of a saved character.</p>
        ${capture ? html`<p>Press a key or mouse button for ${inputBindings.binding(capture.id)!.description}. <button type="button" @click=${stop}>Cancel</button></p>` : ''}
        <p class="input-binding-status" role="status">${status || inputBindings.diagnostics.at(-1) || ''}</p>
        ${contexts.map(
          (context) => html`<section><h3>${context}</h3>
          ${bindings
            .filter((binding) => contextsForRun(binding, debugRun)[0] === context)
            .map(
              (binding) => html`
            <div class="input-binding-row" data-binding-id=${binding.id}>
              <span>${binding.description}</span>
              ${inputBindings.chords(binding.id).map(
                (_, alternative) => html`
                <button type="button" data-binding-alternative=${alternative} @click=${() => start(binding.id, alternative)}>
                  ${inputBindings.alternativeLabel(binding.id, alternative)}
                </button>`,
              )}
              <small>${contextsForRun(binding, debugRun).join(', ')}</small>
            </div>`,
            )}
        </section>`,
        )}
        <section><h3>Fixed browser controls</h3>${NATIVE_INPUTS.map((native) => html`<p>${native.code}: ${native.description}</p>`)}</section>
        <button type="button" @click=${() => {
          stop();
          inputBindings.reset();
          status = 'Defaults restored';
          draw();
        }}>Reset to defaults</button>
      </details>`,
      root,
    );
  };
  inputBindings.subscribe(draw);
  draw();
};
