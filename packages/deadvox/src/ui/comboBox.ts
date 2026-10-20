// The game's own combo box for in-game choices. A native select's picker takes focus from the page,
// and play pauses on blur, so the choice list is drawn here and focus stays in the document.

import { html, type TemplateResult } from 'lit-html';
import { AsyncDirective, directive, type PartInfo, PartType } from 'lit-html/async-directive.js';
import { ifDefined } from 'lit-html/directives/if-defined.js';
import { live } from 'lit-html/directives/live.js';
import { createRef, ref } from 'lit-html/directives/ref.js';
import { styleMap } from 'lit-html/directives/style-map.js';
import { comboBoxKey } from '../game/inputBindings.ts';

export interface ComboBoxOption {
  readonly value: string;
  readonly label: string;
}

export interface ComboBoxProps {
  /** The field's id, for a `<label for>`. */
  readonly id?: string;
  /** The field's and the list's accessible name. */
  readonly label: string;
  readonly options: readonly ComboBoxOption[];
  /** The chosen option's value. */
  readonly value: string;
  /** Receives a newly chosen value; the owner renders it back as `value`. */
  readonly choose: (value: string) => void;
}

/** Keeps the list this far inside the viewport. */
const EDGE_PX = 8;

interface Placement {
  readonly left: number;
  readonly minWidth: number;
  readonly maxWidth: number;
  readonly maxHeight: number;
  /** Below the field the list hangs from `top`; flipped above it, it stands on `bottom`. */
  readonly top?: number;
  readonly bottom?: number;
}

const samePlacement = (a: Placement | undefined, b: Placement): boolean =>
  a !== undefined &&
  a.left === b.left &&
  a.minWidth === b.minWidth &&
  a.maxWidth === b.maxWidth &&
  a.maxHeight === b.maxHeight &&
  a.top === b.top &&
  a.bottom === b.bottom;

const placementStyle = (placement: Placement | undefined): Record<string, string> =>
  placement
    ? {
        left: `${placement.left}px`,
        minWidth: `${placement.minWidth}px`,
        maxWidth: `${placement.maxWidth}px`,
        maxHeight: `${placement.maxHeight}px`,
        top: placement.top === undefined ? 'auto' : `${placement.top}px`,
        bottom: placement.bottom === undefined ? 'auto' : `${placement.bottom}px`,
      }
    : {};

/** Case-insensitive substring match on labels; a blank filter keeps every option. */
const filterComboBoxOptions = (options: readonly ComboBoxOption[], filter: string): readonly ComboBoxOption[] => {
  const needle = filter.trim().toLocaleLowerCase();
  return needle ? options.filter(({ label }) => label.toLocaleLowerCase().includes(needle)) : options;
};

let comboBoxCount = 0;

class ComboBoxDirective extends AsyncDirective {
  private props: ComboBoxProps | undefined;
  private expanded = false;
  /** What the player typed since the list opened; undefined shows the chosen label and every option. */
  private filter: string | undefined;
  private active = 0;
  private placement: Placement | undefined;
  private listening = false;
  private readonly field = createRef<HTMLInputElement>();
  private readonly list = createRef<HTMLElement>();
  private readonly listId: string;

  constructor(partInfo: PartInfo) {
    super(partInfo);
    if (partInfo.type !== PartType.CHILD) {
      throw new Error('comboBox() renders in a child position');
    }
    comboBoxCount += 1;
    this.listId = `combo-box-${comboBoxCount}`;
  }

  render(props: ComboBoxProps): TemplateResult {
    this.props = props;
    if (this.expanded) {
      // The owner's redraw can move the field; place the list once the new DOM is committed.
      queueMicrotask(this.place);
    }
    return this.view(props);
  }

  protected override disconnected(): void {
    this.listen(false);
  }

  protected override reconnected(): void {
    this.listen(this.expanded);
  }

  private visible(props: ComboBoxProps): readonly ComboBoxOption[] {
    return filterComboBoxOptions(props.options, this.filter ?? '');
  }

  private view(props: ComboBoxProps): TemplateResult {
    const visible = this.visible(props);
    const active = this.expanded && this.active < visible.length ? this.active : -1;
    const text = this.filter ?? props.options.find(({ value }) => value === props.value)?.label ?? '';
    return html`<span class="combo-box">
      <input ${ref(this.field)} id=${ifDefined(props.id)} class="combo-box-field" type="text" role="combobox" autocomplete="off"
        spellcheck="false" aria-label=${props.label} aria-autocomplete="list"
        aria-expanded=${this.expanded ? 'true' : 'false'} aria-controls=${this.listId}
        aria-activedescendant=${ifDefined(active >= 0 ? `${this.listId}-${active}` : undefined)}
        .value=${live(text)} @click=${this.toggle} @input=${this.typed} @keydown=${this.key}
        @blur=${this.focusLeft}>
      <ul ${ref(this.list)} id=${this.listId} class="combo-box-list" role="listbox" aria-label=${props.label}
        ?hidden=${!this.expanded} style=${styleMap(placementStyle(this.placement))} @mousedown=${this.keepFocus}>
        ${
          visible.length > 0
            ? visible.map(
                (option, index) => html`<li id=${`${this.listId}-${index}`} role="option"
                  aria-selected=${index === active ? 'true' : 'false'}
                  class=${option.value === props.value ? 'combo-box-option combo-box-chosen' : 'combo-box-option'}
                  @pointermove=${() => this.highlight(index)} @click=${() => this.pick(option)}>${option.label}</li>`,
              )
            : html`<li class="combo-box-option combo-box-empty" role="presentation">No matches</li>`
        }
      </ul>
    </span>`;
  }

  private redraw(): void {
    if (this.props && this.isConnected) {
      this.setValue(this.view(this.props));
    }
  }

  private open(): void {
    const { props } = this;
    if (this.expanded || !props) {
      return;
    }
    this.expanded = true;
    this.filter = undefined;
    this.active = Math.max(
      0,
      props.options.findIndex(({ value }) => value === props.value),
    );
    this.listen(true);
    this.redraw();
    this.place();
    this.revealActive();
    // Typing replaces the shown choice rather than appending to it.
    this.field.value?.select();
  }

  /**
   * Closes the list and restores the chosen label. Closing also blurs the field: under pointer lock no
   * press moves focus, and a focused field would keep typing the game's letter keys.
   */
  private close(release = true): void {
    if (this.expanded || this.filter !== undefined) {
      this.expanded = false;
      this.filter = undefined;
      this.placement = undefined;
      this.listen(false);
      this.redraw();
    }
    if (release) {
      this.field.value?.blur();
    }
  }

  private pick(option: ComboBoxOption): void {
    const changed = option.value !== this.props?.value;
    this.close();
    if (changed) {
      this.props?.choose(option.value);
    }
  }

  private highlight(index: number): void {
    if (this.active !== index) {
      this.active = index;
      this.redraw();
    }
  }

  private move(step: number): void {
    const count = this.props ? this.visible(this.props).length : 0;
    if (count > 0) {
      this.highlight(Math.max(0, Math.min(count - 1, this.active + step)));
      this.revealActive();
    }
  }

  /** Scrolls only the list, so keyboard moves never scroll the panel behind it. */
  private revealActive(): void {
    const list = this.list.value;
    const row = list?.children[this.active];
    if (!(list && row instanceof HTMLElement)) {
      return;
    }
    if (row.offsetTop < list.scrollTop) {
      list.scrollTop = row.offsetTop;
    } else if (row.offsetTop + row.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = row.offsetTop + row.offsetHeight - list.clientHeight;
    }
  }

  private listen(on: boolean): void {
    if (on === this.listening) {
      return;
    }
    this.listening = on;
    if (on) {
      // Bubble phase: under pointer lock the canvas's own press stops at the menu pointer's capture
      // listener, and only the press it forwards to the element under the drawn cursor bubbles here.
      document.addEventListener('pointerdown', this.pressed);
      document.addEventListener('scroll', this.scrolled, true);
      globalThis.addEventListener('resize', this.place);
    } else {
      document.removeEventListener('pointerdown', this.pressed);
      document.removeEventListener('scroll', this.scrolled, true);
      globalThis.removeEventListener('resize', this.place);
    }
  }

  /**
   * The list is fixed to the viewport, so a scrolling panel can't clip it. It hangs below the field,
   * flips above when it doesn't fit there and there is more room above, and is cut to the room left.
   */
  private readonly place = (): void => {
    const field = this.field.value;
    const list = this.list.value;
    if (!(this.expanded && field && list)) {
      return;
    }
    const box = field.getBoundingClientRect();
    const below = innerHeight - box.bottom - EDGE_PX;
    const above = box.top - EDGE_PX;
    const flip = list.scrollHeight > below && above > below;
    const maxWidth = Math.max(0, innerWidth - 2 * EDGE_PX);
    const width = Math.min(maxWidth, Math.max(box.width, list.getBoundingClientRect().width));
    const next: Placement = {
      left: Math.max(EDGE_PX, Math.min(box.left, innerWidth - EDGE_PX - width)),
      minWidth: Math.min(box.width, maxWidth),
      maxWidth,
      maxHeight: Math.max(0, flip ? above : below),
      ...(flip ? { bottom: innerHeight - box.top } : { top: box.bottom }),
    };
    if (!samePlacement(this.placement, next)) {
      this.placement = next;
      this.redraw();
    }
  };

  private readonly toggle = (): void => {
    if (this.expanded) {
      this.close();
    } else {
      this.open();
    }
  };

  private readonly typed = (event: Event): void => {
    const field = event.currentTarget;
    if (!(field instanceof HTMLInputElement)) {
      return;
    }
    this.filter = field.value;
    this.active = 0;
    if (this.expanded) {
      this.redraw();
    } else {
      this.expanded = true;
      this.listen(true);
      this.redraw();
    }
    this.place();
    this.revealActive();
  };

  private readonly key = (event: Event): void => {
    const key = comboBoxKey(event);
    if (key === 'next' || key === 'previous' || key === 'collapse') {
      event.preventDefault();
      this.arrow(key);
    } else if (key === 'choose' && this.expanded) {
      event.preventDefault();
      const option = this.props ? this.visible(this.props)[this.active] : undefined;
      if (option) {
        this.pick(option);
      }
    } else if (key === 'close') {
      this.close();
    }
  };

  /** Down (with or without Alt) opens the list; once it is open the arrows move the highlight and Alt+Up closes it. */
  private arrow(key: 'next' | 'previous' | 'collapse'): void {
    if (!this.expanded) {
      if (key === 'next') {
        this.open();
      }
    } else if (key === 'collapse') {
      this.close();
    } else {
      this.move(key === 'next' ? 1 : -1);
    }
  }

  private readonly focusLeft = (): void => {
    this.close(false);
  };

  private readonly keepFocus = (event: Event): void => {
    // A free-mouse press on an option would otherwise blur the field and close the list before the click.
    event.preventDefault();
  };

  private readonly pressed = (event: Event): void => {
    const root = this.field.value?.parentElement;
    if (!(root && event.target instanceof Node && root.contains(event.target))) {
      this.close();
    }
  };

  private readonly scrolled = (event: Event): void => {
    if (event.target !== this.list.value) {
      this.place();
    }
  };
}

/** Renders a combo box; its open list, typed filter and highlight survive the owner's redraws. */
export const comboBox = directive(ComboBoxDirective);
