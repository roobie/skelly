import type { ScreenText } from '@skelly/engine/content';
import { GRAPHICS_KEYS, type GraphicsKey, type GraphicsOptions } from '@skelly/engine/look';
import { hundredthsText } from '@skelly/engine/text';
import { html, render, type TemplateResult } from 'lit-html';
import type { GraphicsControls } from '../presentation/graphicsControls.ts';

type OptionsText = ScreenText['options'];

const valueText = (key: GraphicsKey, value: number | boolean, tuning: GraphicsOptions, text: OptionsText): string => {
  const option = tuning[key];
  if ('choices' in option) {
    return option.choices.find((choice) => choice.value === value)?.label ?? '';
  }
  if (typeof value === 'number') {
    return hundredthsText(value);
  }
  return value ? text.on : text.off;
};

const choiceControl = (
  key: GraphicsKey,
  option: Extract<GraphicsOptions[GraphicsKey], { choices: unknown }>,
  state: { value: number; change: (value: number) => void; detail: string },
): TemplateResult => html`<select
  id="graphics-${key}"
  title=${state.detail}
  @change=${(event: Event) => state.change(Number((event.currentTarget as HTMLSelectElement).value))}
>${option.choices.map(
  (choice) => html`<option value=${choice.value} ?selected=${choice.value === state.value}>${choice.label}</option>`,
)}</select>`;

const scaleControl = (
  key: GraphicsKey,
  option: GraphicsOptions['bloomScale'],
  state: { value: number; change: (value: number | boolean) => void },
): TemplateResult => {
  const setFromPointer = (event: MouseEvent | PointerEvent): void => {
    if (event.clientX === 0) {
      return;
    }
    const bounds = (event.currentTarget as HTMLInputElement).getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    const value = option.min + (Math.round(ratio * 100) / 100) * (option.max - option.min);
    state.change(Math.max(option.min, Math.min(option.max, value)));
  };
  return html`<input
    id="graphics-${key}"
    type="range"
    min=${option.min}
    max=${option.max}
    step=${option.max === option.min ? 1 : (option.max - option.min) / 100}
    .value=${String(state.value)}
    ?disabled=${option.min === option.max}
    @input=${(event: Event) => state.change(Number((event.currentTarget as HTMLInputElement).value))}
    @pointerdown=${setFromPointer}
    @click=${setFromPointer}
  />`;
};

const control = (
  key: GraphicsKey,
  option: GraphicsOptions[GraphicsKey],
  state: { value: number | boolean; change: (value: number | boolean) => void; text: OptionsText },
): TemplateResult => {
  if ('choices' in option) {
    return choiceControl(key, option, { ...state, value: Number(state.value), detail: state.text.reloadDetail });
  }
  if ('options' in option) {
    return html`<input
      id="graphics-${key}"
      type="checkbox"
      .checked=${Boolean(state.value)}
      ?disabled=${option.options.length === 1}
      @change=${(event: Event) => state.change((event.currentTarget as HTMLInputElement).checked)}
    />`;
  }
  return scaleControl(key, option, { ...state, value: Number(state.value) });
};

export const renderGraphicsOptions = (root: HTMLElement, graphics: GraphicsControls, text: OptionsText): void => {
  const draw = (): void => {
    const { values, player } = graphics;
    const controls = GRAPHICS_KEYS.map((key): TemplateResult => {
      const option = graphics.tuning[key];
      const change = (value: number | boolean): void => {
        graphics.set(key, value);
        draw();
      };
      return html`
        <div class="graphics-options__row" data-graphics-key=${key}>
          <label for="graphics-${key}">${option.label}</label>
          ${control(key, option, { value: values[key], change, text })}
          <output>${valueText(key, values[key], graphics.tuning, text)}</output>
          <button
            type="button"
            ?disabled=${player[key] === undefined}
            @click=${() => {
              graphics.clear(key);
              draw();
            }}
          >${text.modDefault}</button>
        </div>
      `;
    });
    render(html`<section class="graphics-options"><h2>${text.graphicsHeading}</h2>${controls}</section>`, root);
  };
  draw();
};
