import { html, render, type TemplateResult } from 'lit-html';
import { GRAPHICS_KEYS, type GraphicsKey, type GraphicsOptions } from '../core/graphics.ts';
import type { ScreenText } from '../core/schema.ts';
import type { GraphicsControls } from '../game/graphicsControls.ts';

type OptionsText = ScreenText['options'];

const valueText = (value: number | boolean, text: OptionsText): string => {
  if (typeof value === 'number') {
    return value.toFixed(2);
  }
  return value ? text.on : text.off;
};

const scaleControl = (
  key: GraphicsKey,
  option: GraphicsOptions['bloomScale'],
  state: { value: number; overridden: boolean; change: (value: number | boolean) => void },
): TemplateResult => {
  const setFromPointer = (event: MouseEvent | PointerEvent): void => {
    if (event.clientX === 0 || state.overridden) {
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
    ?disabled=${state.overridden || option.min === option.max}
    @input=${(event: Event) => state.change(Number((event.currentTarget as HTMLInputElement).value))}
    @pointerdown=${setFromPointer}
    @click=${setFromPointer}
  />`;
};

export const renderGraphicsOptions = (root: HTMLElement, graphics: GraphicsControls, text: OptionsText): void => {
  const draw = (): void => {
    const { values, player } = graphics;
    const controls = GRAPHICS_KEYS.map((key): TemplateResult => {
      const option = graphics.tuning[key];
      const overridden = graphics.overrides[key] !== undefined;
      const change = (value: number | boolean): void => {
        graphics.set(key, value);
        draw();
      };
      return html`
        <div class="graphics-options__row" data-graphics-key=${key}>
          <label for="graphics-${key}">${option.label}</label>
          ${
            'options' in option
              ? html`<input
                id="graphics-${key}"
                type="checkbox"
                .checked=${Boolean(values[key])}
                ?disabled=${overridden || option.options.length === 1}
                @change=${(event: Event) => change((event.currentTarget as HTMLInputElement).checked)}
              />`
              : scaleControl(key, option, { value: Number(values[key]), overridden, change })
          }
          <output>${valueText(values[key], text)}</output>
          <button
            type="button"
            ?disabled=${player[key] === undefined}
            @click=${() => {
              graphics.clear(key);
              draw();
            }}
          >${text.modDefault}</button>
          ${overridden ? html`<span>${text.urlOverride}</span>` : ''}
        </div>
      `;
    });
    render(html`<section class="graphics-options"><h2>${text.graphicsHeading}</h2>${controls}</section>`, root);
  };
  draw();
};
