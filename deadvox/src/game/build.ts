// Build mode (B, only with ?debug=1), a development tool: break blocks with the left button, place the
// chosen block with the right, and pick it with 1–9 or the wheel. Outside build
// mode, those keys belong to the quickbar.

import { BoxGeometry, EdgesGeometry, LineBasicMaterial, LineSegments } from 'three';
import { blockId } from '../core/content.ts';
import type { Vec3 } from '../core/coords.ts';
import { type Body, bodyOverlapsBlock } from '../core/physics.ts';
import { raycast } from '../core/raycast.ts';
import type { Engine } from './engine.ts';

const DIGIT_KEY = /^Digit([1-9])$/;

export class BuildMode {
  on = false;
  private selected = 0;
  private readonly engine: Engine;
  private readonly hotbar: HTMLElement;
  private readonly body: Body;
  private readonly reach: number;
  private readonly outline: LineSegments;

  constructor(engine: Engine, hotbar: HTMLElement, body: Body, reachBlocks: number) {
    this.engine = engine;
    this.hotbar = hotbar;
    this.body = body;
    this.reach = reachBlocks;
    const s = engine.config.scale.blockSize;
    this.outline = new LineSegments(
      new EdgesGeometry(new BoxGeometry(s * 1.002, s * 1.002, s * 1.002)),
      new LineBasicMaterial({ color: 0x11_11_11 }),
    );
    this.outline.visible = false;
    engine.scene.add(this.outline);
    this.draw();
  }

  private get placeable() {
    return this.engine.registry.blocks.slice(1);
  }

  toggle(): void {
    this.on = !this.on;
    this.outline.visible = false;
    this.draw();
  }

  /** 1–9 choose a block. Returns true if the key was used. */
  key(code: string): boolean {
    const digit = DIGIT_KEY.exec(code);
    if (!(this.on && digit) || Number(digit[1]) > Math.min(9, this.placeable.length)) {
      return false;
    }
    this.selected = Number(digit[1]) - 1;
    this.draw();
    return true;
  }

  wheel(delta: number): void {
    if (!this.on) {
      return;
    }
    const n = Math.min(9, this.placeable.length);
    this.selected = (this.selected + (delta > 0 ? 1 : -1) + n) % n;
    this.draw();
  }

  /** Breaks (left) or places (right) at the targeted block. */
  click(button: number, eye: Vec3, dir: Vec3): void {
    const { world, streamer, registry, isSolid } = this.engine;
    const hit = this.on ? raycast(eye, dir, this.reach, isSolid) : undefined;
    if (!hit) {
      return;
    }
    if (button === 0) {
      streamer.markEdited(world.setBlock(...hit.block, 0));
    } else if (button === 2) {
      const target: Vec3 = [hit.block[0] + hit.normal[0], hit.block[1] + hit.normal[1], hit.block[2] + hit.normal[2]];
      const block = this.placeable[this.selected];
      if (block && !bodyOverlapsBlock(this.body, target)) {
        streamer.markEdited(world.setBlock(...target, blockId(registry, block.id)));
      }
    }
  }

  /** Outlines the targeted block; returns its name for the HUD. */
  target(eye: Vec3, dir: Vec3, active: boolean): string {
    const { world, registry, isSolid } = this.engine;
    const hit = this.on && active ? raycast(eye, dir, this.reach, isSolid) : undefined;
    this.outline.visible = hit !== undefined;
    if (!hit) {
      return '';
    }
    const s = this.engine.config.scale.blockSize;
    this.outline.position.set((hit.block[0] + 0.5) * s, (hit.block[1] + 0.5) * s, (hit.block[2] + 0.5) * s);
    return registry.blocks[world.getBlock(...hit.block)]?.name ?? '';
  }

  private draw(): void {
    this.hotbar.hidden = !this.on;
    this.hotbar.replaceChildren(
      ...this.placeable.slice(0, 9).map((block, i) => {
        const slot = document.createElement('div');
        slot.className = i === this.selected ? 'selected' : '';
        const swatch = document.createElement('span');
        swatch.style.background = block.color;
        slot.append(swatch, `${i + 1} ${block.name}`);
        return slot;
      }),
    );
  }
}
