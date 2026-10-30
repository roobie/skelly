// The inventory's item viewer (`DESIGN.md`, "Inventory screen"): one item instance's own model, turned by dragging
// and zoomed by the wheel. It only reads the item and draws it, so opening and closing it changes no game state.

import { html, nothing, render } from 'lit-html';
import type { Object3D } from 'three';
import type { Item } from '../core/items.ts';
import type { GraphicsTuningDef } from '../core/schema.ts';
import { inputBindings } from '../game/inputBindings.ts';
import { fillHint, keyCap } from './keyCap.ts';
import { wheelPixels } from './wheel.ts';

/** Radians, and the view's half shorter side per bounding radius. */
interface ItemViewPose {
  readonly yaw: number;
  readonly pitch: number;
  readonly framing: number;
}

/** Builds and draws an item's model; the item pictures satisfy it, so the viewer shares their renderer. */
export interface ItemViewSource {
  model: (item: Item) => Object3D | undefined;
  disposeModel: (model: Object3D) => void;
  view: (model: Object3D, pose: ItemViewPose, width: number, height: number) => CanvasImageSource | undefined;
}

type ItemViewerTuning = GraphicsTuningDef['itemViewer'];

const RADIANS_PER_DEGREE = Math.PI / 180;

/** Whether a pointer press is the view binding; a key binding instead reaches the screen as an action. */
export const isViewItemPress = (event: Pick<MouseEvent, 'button' | 'shiftKey'>): boolean =>
  inputBindings
    .chords('inventory.view-item')
    .some((chord) => chord.code === `Mouse${event.button}` && (chord.modifier === 'shift') === event.shiftKey);

interface Viewing {
  readonly uid: number;
  name: string;
  model: Object3D;
  dispose: () => void;
  yaw: number;
  pitch: number;
  zoom: number;
}

export class ItemViewer {
  private readonly host: () => HTMLElement | null;
  private readonly source: () => ItemViewSource | undefined;
  private readonly tuning: () => ItemViewerTuning;
  private readonly closeText: () => string;
  private viewing: Viewing | undefined;
  private drag: { readonly pointerId: number; x: number; y: number } | undefined;
  private wheelHost: HTMLElement | undefined;
  /** What had focus before the viewer took it, given back on close. */
  private returnFocus: HTMLElement | undefined;
  /** The covered inventory parts this viewer made inert. */
  private readonly covered = new Set<Element>();

  constructor(
    host: () => HTMLElement | null,
    source: () => ItemViewSource | undefined,
    tuning: () => ItemViewerTuning,
    closeText: () => string,
  ) {
    this.host = host;
    this.source = source;
    this.tuning = tuning;
    this.closeText = closeText;
    globalThis.addEventListener('pointermove', (e) => this.pointerMove(e));
    globalThis.addEventListener('pointerup', (e) => this.pointerUp(e));
    globalThis.addEventListener('pointercancel', (e) => this.pointerUp(e));
    globalThis.addEventListener('resize', () => this.draw());
  }

  get viewedUid(): number | undefined {
    return this.viewing?.uid;
  }

  /** Opens on the item; false when it has no model ready to show. */
  open(item: Item, name: string): boolean {
    const source = this.source();
    const model = source?.model(item);
    if (!model) {
      return false;
    }
    const tuning = this.tuning();
    if (!this.viewing) {
      const focused = document.activeElement;
      this.returnFocus = focused instanceof HTMLElement ? focused : undefined;
    }
    this.viewing?.dispose();
    this.viewing = {
      uid: item.uid,
      dispose: () => source?.disposeModel(model),
      name,
      model,
      yaw: tuning.startYawDegrees * RADIANS_PER_DEGREE,
      pitch: tuning.startPitchDegrees * RADIANS_PER_DEGREE,
      zoom: 1,
    };
    this.render();
    this.draw();
    this.host()?.querySelector<HTMLElement>('.inv-viewer')?.focus({ preventScroll: true });
    return true;
  }

  close(): void {
    const wasViewing = this.viewing !== undefined;
    this.viewing?.dispose();
    this.viewing = undefined;
    this.drag = undefined;
    this.render();
    if (!wasViewing) {
      return;
    }
    const { returnFocus } = this;
    this.returnFocus = undefined;
    if (returnFocus?.isConnected) {
      returnFocus.focus({ preventScroll: true });
    }
  }

  /**
   * An aria-modal dialog does not stop focus or a native key press reaching a control it covers, so every other part
   * of the panel is inert while the viewer is open. Repeated on each render, because a redraw can add a part.
   */
  private syncCovered(host: HTMLElement): void {
    const open = this.viewing !== undefined;
    for (const part of open ? (host.parentElement?.children ?? []) : []) {
      if (part !== host && !part.hasAttribute('inert')) {
        part.setAttribute('inert', '');
        this.covered.add(part);
      }
    }
    if (!open) {
      for (const part of this.covered) {
        part.removeAttribute('inert');
      }
      this.covered.clear();
    }
  }

  /** Follows the viewed item after the screen redraws: its current look, or closed once it has left the screen. */
  sync(find: (uid: number) => Item | undefined, name: (item: Item) => string): void {
    const { viewing } = this;
    if (!viewing) {
      return;
    }
    const item = find(viewing.uid);
    const source = this.source();
    const model = item && source?.model(item);
    if (!(item && model)) {
      this.close();
      return;
    }
    if (viewing.model !== model) {
      viewing.dispose();
    }
    viewing.model = model;
    viewing.dispose = () => source?.disposeModel(model);
    viewing.name = name(item);
    this.render();
    this.draw();
  }

  private render(): void {
    const host = this.host();
    if (!host) {
      return;
    }
    if (host !== this.wheelHost) {
      // Captured, because the menu pointer's forwarded wheel does not bubble.
      host.addEventListener('wheel', (e) => this.wheel(e), { capture: true, passive: false });
      this.wheelHost = host;
    }
    const { viewing } = this;
    render(
      viewing
        ? html`
          <div class="inv-viewer" role="dialog" aria-modal="true" tabindex="-1" aria-label=${viewing.name} data-item-viewer=${viewing.uid} @pointerdown=${(e: PointerEvent) => this.pointerDown(e)}>
            <div class="inv-viewer-card">
              <header class="inv-viewer-head">
                <h3>${viewing.name}</h3>
                <button class="inv-option" type="button" data-action="viewer.close" @click=${() => this.close()}>${fillHint(this.closeText(), { key: keyCap('inventory.view-item') })}</button>
              </header>
              <canvas class="inv-viewer-canvas" data-wheel-owner></canvas>
            </div>
          </div>
        `
        : nothing,
      host,
    );
    this.syncCovered(host);
  }

  private canvas(): HTMLCanvasElement | null | undefined {
    return this.host()?.querySelector<HTMLCanvasElement>('.inv-viewer-canvas');
  }

  private draw(): void {
    const { viewing } = this;
    const source = this.source();
    const canvas = this.canvas();
    if (!(viewing && source && canvas)) {
      return;
    }
    const scale = globalThis.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(canvas.clientWidth * scale));
    const height = Math.max(1, Math.round(canvas.clientHeight * scale));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const pose = { yaw: viewing.yaw, pitch: viewing.pitch, framing: this.tuning().framing / viewing.zoom };
    const image = source.view(viewing.model, pose, width, height);
    const context = canvas.getContext('2d');
    if (image && context) {
      context.clearRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
    }
  }

  private pointerDown(e: PointerEvent): void {
    // The viewer covers the screen, so no press reaches the inventory beneath it.
    e.stopPropagation();
    // A left press on the model always turns it, even when the view binding is the left button; the close button
    // still closes.
    if (e.button === 0 && (e.target as Element).closest('.inv-viewer-canvas')) {
      e.preventDefault();
      this.drag = { pointerId: e.pointerId, x: e.clientX, y: e.clientY };
      return;
    }
    if (isViewItemPress(e) && !(e.target as Element).closest('button')) {
      e.preventDefault();
      this.close();
    }
  }

  private pointerMove(e: PointerEvent): void {
    const { drag, viewing } = this;
    if (!(drag && viewing) || e.pointerId !== drag.pointerId) {
      return;
    }
    const { degreesPerPixel, pitchLimitDegrees } = this.tuning();
    const step = degreesPerPixel * RADIANS_PER_DEGREE;
    const limit = pitchLimitDegrees * RADIANS_PER_DEGREE;
    viewing.yaw -= (e.clientX - drag.x) * step;
    viewing.pitch = Math.max(-limit, Math.min(limit, viewing.pitch + (e.clientY - drag.y) * step));
    drag.x = e.clientX;
    drag.y = e.clientY;
    this.draw();
  }

  private pointerUp(e: PointerEvent): void {
    if (this.drag?.pointerId === e.pointerId) {
      this.drag = undefined;
    }
  }

  private wheel(e: WheelEvent): void {
    const { viewing } = this;
    const canvas = this.canvas();
    if (!(viewing && canvas && e.target === canvas)) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const { zoomPerWheelPixel, zoomMin, zoomMax } = this.tuning();
    const pixels = wheelPixels(e.deltaY, e.deltaMode, canvas.clientHeight);
    viewing.zoom = Math.max(zoomMin, Math.min(zoomMax, viewing.zoom * Math.exp(-pixels * zoomPerWheelPixel)));
    this.draw();
  }
}
