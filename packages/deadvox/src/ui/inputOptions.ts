import { html, render } from 'lit-html';
import type { ScreenText } from '../core/schema.ts';
import { fillText } from '../core/textTemplate.ts';
import {
  bindingIsDebugOnly,
  contextsForRun,
  inputBindings,
  keyboardInput,
  NATIVE_EDITING,
  NATIVE_INPUTS,
} from '../game/inputBindings.ts';
import { factDetail } from './factDetail.ts';

export const mountInputOptions = (root: HTMLElement, text: ScreenText['inputOptions'], debugRun = false): void => {
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
      status = issue ?? text.saved;
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
      <details class="input-options"><summary>${text.heading}</summary>
        <p>${factDetail(text.browserControlsLabel, NATIVE_EDITING)}</p>
        <p>${factDetail(text.storageLabel, text.storage)}</p>
        <p>${text.keyboardNote}</p>
        ${capture ? html`<p>${fillText(text.capturing, { action: inputBindings.binding(capture.id)!.description })} <button type="button" @click=${stop}>${text.cancel}</button></p>` : ''}
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
        <section><h3>${text.fixedHeading}</h3>${NATIVE_INPUTS.map((native) => html`<p>${fillText(text.fixedControl, { code: native.code, action: native.description })}</p>`)}</section>
        <button type="button" @click=${() => {
          stop();
          inputBindings.reset();
          status = text.restored;
          draw();
        }}>${text.reset}</button>
      </details>`,
      root,
    );
  };
  inputBindings.subscribe(draw);
  draw();
};
