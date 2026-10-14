import { html, render } from 'lit-html';
import type { Vec3 } from '../core/coords.ts';
import { ownershipCell } from '../core/templateOwnership.ts';
import { type Placement, placedPoint, type VoxelProvenance } from '../core/templates.ts';

export interface KitCell {
  readonly local: Vec3;
  readonly world: Vec3;
  readonly ownership: number;
  readonly reserved: boolean;
  readonly provenance: VoxelProvenance | undefined;
}

export const kitSlice = (placement: Placement, y: number): KitCell[] => {
  const { template } = placement;
  if (!template.ownership || !Number.isInteger(y) || y < 0 || y >= template.size[1]) {
    return [];
  }
  const cells: KitCell[] = [];
  for (let z = 0; z < template.size[2]; z++) {
    for (let x = 0; x < template.size[0]; x++) {
      const local: Vec3 = [x, y, z];
      const index = ownershipCell(template.size, local);
      cells.push({
        local,
        world: placedPoint(placement, [x + 0.5, y, z + 0.5]).map(Math.floor) as Vec3,
        ownership: template.ownership[index]!,
        reserved: template.reserved?.[index] === 1,
        provenance: template.provenance?.[index],
      });
    }
  }
  return cells;
};

const cellText = (cell: KitCell): string => {
  const record = cell.provenance;
  const claim = ['unclaimed', 'occupancy', 'air'][cell.ownership];
  return `cell ${cell.world.join(',')} · local ${cell.local.join(',')}\nownership ${claim} · reserved void ${cell.reserved ? 'yes' : 'no'}\nowner ${record?.owner ?? '—'}\nsource ${record?.source ?? '—'}\nvariant ${record?.variant ?? '—'}\nslot ${record?.slotPath ?? '—'} · turn ${record?.turn ?? '—'}`;
};

const inputIndex = (event: Event, max: number): number =>
  Math.max(0, Math.min(max, Math.trunc(Number((event.target as HTMLInputElement).value) || 0)));

/** A debug-only authored-cell slice, not a second world ownership index. */
export class KitOverlay {
  private readonly host = document.createElement('aside');
  private open = false;
  private selected = 0;
  private layer = 0;
  private readonly placements: readonly Placement[];

  constructor(placements: readonly Placement[]) {
    this.placements = placements.filter(({ template }) => template.ownership !== undefined);
    if (this.placements.length === 0) {
      return;
    }
    this.host.id = 'debug-kit-overlay';
    this.host.style.cssText =
      'position:fixed;right:12px;bottom:12px;z-index:40;background:#111e;color:#eee;padding:8px;max-width:75vw;font:12px monospace';
    document.body.append(this.host);
    this.draw();
  }

  private readonly toggle = (): void => {
    this.open = !this.open;
    this.draw();
  };

  private readonly select = (event: Event): void => {
    this.selected = inputIndex(event, this.placements.length - 1);
    this.layer = 0;
    this.draw();
  };

  private readonly changeLayer = (event: Event): void => {
    this.layer = inputIndex(event, this.placements[this.selected]!.template.size[1] - 1);
    this.draw();
  };

  private draw(): void {
    const placement = this.placements[this.selected]!;
    const slice = html`
      <div><label>Placement <input aria-label="Kit placement" type="number" min="0" max=${this.placements.length - 1} .value=${String(this.selected)} @change=${this.select} /></label> ${placement.template.id} · turn ${placement.turn}</div>
      <div><label>Local Y <input aria-label="Kit layer" type="number" min="0" max=${placement.template.size[1] - 1} .value=${String(this.layer)} @change=${this.changeLayer} /></label> blue occupancy · green air · magenta reserved · grey unclaimed</div>
      <canvas aria-label="Compiled kit ownership slice" style="max-width:70vw;max-height:45vh;image-rendering:pixelated"></canvas>
      <pre style="white-space:pre-wrap;max-width:70vw;margin:4px 0">Point at a cell for compiler provenance.</pre>
    `;
    render(
      html`
        <button type="button" @click=${this.toggle}>Kit cells · ${this.open ? 'close' : 'open'}</button>
        ${this.open ? slice : ''}
      `,
      this.host,
    );
    const canvas = this.host.querySelector('canvas');
    if (!canvas) {
      return;
    }
    const cells = kitSlice(placement, this.layer);
    const pitch = 8;
    canvas.width = placement.template.size[0] * pitch;
    canvas.height = placement.template.size[2] * pitch;
    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }
    for (const cell of cells) {
      context.fillStyle = cell.reserved ? '#ed55d5' : ['#444', '#478bdd', '#57a77b'][cell.ownership]!;
      context.fillRect(cell.local[0] * pitch, cell.local[2] * pitch, pitch - 1, pitch - 1);
    }
    canvas.onpointermove = (event) => {
      const bounds = canvas.getBoundingClientRect();
      const x = Math.floor(((event.clientX - bounds.left) * placement.template.size[0]) / bounds.width);
      const z = Math.floor(((event.clientY - bounds.top) * placement.template.size[2]) / bounds.height);
      const cell = cells[x + placement.template.size[0] * z];
      const detail = this.host.querySelector('pre');
      if (detail) {
        detail.textContent = cell ? cellText(cell) : '';
      }
    };
  }
}
