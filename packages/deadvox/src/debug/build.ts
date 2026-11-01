// Debug block editing. Gated semantic slot selection and the wheel share the same selected block.

import { html, render } from 'lit-html';
import { BoxGeometry, EdgesGeometry, LineBasicMaterial, LineSegments } from 'three';
import { actionText, fillText } from '../core/actionText.ts';
import type { BlockBlow } from '../core/blockDamage.ts';
import { blockId } from '../core/content.ts';
import type { Vec3 } from '../core/coords.ts';
import { decimalText } from '../core/numberText.ts';
import { type Body, bodyOverlapsBlock } from '../core/physics.ts';
import { raycast } from '../core/raycast.ts';
import type { Engine } from '../game/engine.ts';
import { inputBindings, labelForAction } from '../game/inputBindings.ts';
import { playerTuning } from '../game/player.ts';

const hotbarTemplate = (blocks: readonly { color: string; name: string }[], selected: number) => html`
  ${blocks.slice(0, 9).map(
    (block, i) => html`
    <div class=${i === selected ? 'selected' : ''}>
      <span style=${`background: ${block.color}`}></span>${labelForAction(`debug.build-slot.${i + 1}`)} ${block.name}
    </div>
  `,
  )}
`;

export class BuildMode {
  on = false;
  private selected = 0;
  private readonly engine: Engine;
  private hotbar: HTMLElement | undefined;
  private readonly body: Body;
  private readonly reach: number;
  private readonly outline: LineSegments;
  private readonly strikeTerrainCell: (cell: Vec3, blow: BlockBlow) => boolean;

  constructor(
    engine: Engine,
    body: Body,
    reachBlocks: number,
    strikeTerrainCell: (cell: Vec3, blow: BlockBlow) => boolean,
  ) {
    this.engine = engine;
    this.strikeTerrainCell = strikeTerrainCell;
    inputBindings.subscribe(() => this.draw());
    this.body = body;
    this.reach = reachBlocks;
    const s = engine.config.scale.blockSize;
    this.outline = new LineSegments(
      new EdgesGeometry(new BoxGeometry(s * 1.002, s * 1.002, s * 1.002)),
      new LineBasicMaterial({ color: 0x11_11_11 }),
    );
    this.outline.visible = false;
    engine.scene.add(this.outline);
  }

  private get placeable() {
    return this.engine.registry.blocks.slice(1);
  }

  setHotbar(hotbar: HTMLElement): void {
    this.hotbar = hotbar;
    this.draw();
  }

  toggle(): void {
    this.on = !this.on;
    this.outline.visible = false;
    this.draw();
  }

  selectSlot(slot: number): boolean {
    if (!(this.on && Number.isInteger(slot)) || slot < 0 || slot >= Math.min(9, this.placeable.length)) {
      return false;
    }
    this.selected = slot;
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
    const { world, streamer, registry, isOpaque: isSolid } = this.engine;
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

  strike(mode: 'step' | 'destroy', eye: Vec3, dir: Vec3): boolean {
    const { config, registry, world, isOpaque } = this.engine;
    if (!(config.debug && this.on)) {
      return false;
    }
    const tuning = playerTuning(registry).debugBlockTool;
    const hit = raycast(eye, dir, tuning.reachMetres / config.scale.blockSize, isOpaque);
    if (!hit) {
      return false;
    }
    const block = registry.blocks[world.getBlock(...hit.block)];
    const material = block?.solid ? registry.blockMaterials.get(block.material) : undefined;
    if (!material) {
      return false;
    }
    const effective = Math.max(
      material.minimumStrength,
      material.durability * (mode === 'step' ? tuning.stepDurabilityFraction : 1),
    );
    const admitted = 1 - material.resistance.blunt;
    return this.strikeTerrainCell(hit.block, { kind: 'blunt', strength: admitted > 0 ? effective / admitted : 0 });
  }

  target(eye: Vec3, dir: Vec3, active: boolean): string {
    const { world, registry, config, isOpaque: isSolid } = this.engine;
    const reach = playerTuning(registry).debugBlockTool.reachMetres / config.scale.blockSize;
    const hit = this.on && active ? raycast(eye, dir, reach, isSolid) : undefined;
    this.outline.visible = hit !== undefined;
    if (!hit) {
      return '';
    }
    const s = this.engine.config.scale.blockSize;
    this.outline.position.set((hit.block[0] + 0.5) * s, (hit.block[1] + 0.5) * s, (hit.block[2] + 0.5) * s);
    const block = registry.blocks[world.getBlock(...hit.block)];
    const material = block?.solid ? registry.blockMaterials.get(block.material) : undefined;
    return block && material
      ? fillText(actionText(registry).debugBuild.target, {
          block: block.name,
          damage: decimalText(world.blockDamage.get(hit.block)?.damage ?? 0),
          durability: decimalText(material.durability),
          stepKey: labelForAction('debug.build-damage'),
          destroyKey: labelForAction('debug.build-destroy'),
        })
      : (block?.name ?? '');
  }

  private draw(): void {
    if (!this.hotbar) {
      return;
    }
    this.hotbar.hidden = !this.on;
    render(hotbarTemplate(this.placeable, this.selected), this.hotbar);
  }
}
