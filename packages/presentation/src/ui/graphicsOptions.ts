import type { ScreenText } from '@skelly/engine/content';
import { GRAPHICS_KEYS, type GraphicsKey, type GraphicsOptions } from '@skelly/engine/look';
import { hundredthsText } from '@skelly/engine/text';
import { html, nothing, render, type TemplateResult } from 'lit-html';
import type { GraphicsControls } from '../presentation/graphicsControls.ts';
import { comboBox } from './comboBox.ts';
import { factDetail } from './factDetail.ts';

type OptionsText = ScreenText['options'];

const valueText = (value: number | boolean, text: OptionsText): string => {
  if (typeof value === 'number') {
    return hundredthsText(value);
  }
  return value ? text.on : text.off;
};

/** The game's combo box, not a native select: the locked-pointer menu can only operate drawn controls. */
const choiceControl = (
  key: GraphicsKey,
  option: Extract<GraphicsOptions[GraphicsKey], { choices: unknown }>,
  state: { value: number; change: (value: number) => void; text: OptionsText },
): TemplateResult =>
  html`${comboBox({
    id: `graphics-${key}`,
    label: option.label,
    options: option.choices.map((choice) => ({ value: String(choice.value), label: choice.label })),
    value: String(state.value),
    emptyLabel: state.text.noMatches,
    choose: (value) => state.change(Number(value)),
  })}`;

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
    return choiceControl(key, option, { ...state, value: Number(state.value) });
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
          <label for="graphics-${key}">${'choices' in option ? factDetail(option.label, text.reloadDetail) : option.label}</label>
          ${control(key, option, { value: values[key], change, text })}
          ${'choices' in option ? nothing : html`<output>${valueText(values[key], text)}</output>`}
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
