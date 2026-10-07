// Piles on the ground (DESIGN.md, "Piles"). An item with a model lies at its place in
// the pile's grid (core/pileLayout.ts); everything else is one low bundle per pile,
// taller the more it holds.

import {
  BoxGeometry,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
} from 'three';
import { type Inventory, PILE_GRID, type Pile } from '../core/inventory.ts';
import { defOf } from '../core/items.ts';
import { pileLayout } from '../core/pileLayout.ts';
import { PILE_DISPLAY_KIND } from '../core/schema.ts';
import { CASE_PLACEHOLDER_GEOMETRY, CASE_PLACEHOLDER_MATERIAL } from './caseVisual.ts';
import { withHeightFog } from './heightFog.ts';
import { itemLook } from './itemLook.ts';
import type { GroundModelPart, ModelLibrary } from './models.ts';
import { castsAndReceives } from './shadowFlags.ts';
import { SPENT_CASE_SCATTER_CAP, spentCaseScatter } from './spentCaseScatter.ts';

interface CasePose {
  readonly position: readonly [number, number, number];
  readonly rotation: readonly [number, number, number];
}

interface CasePlan {
  readonly key: string;
  readonly modelId: string | undefined;
  readonly pilePos: Pile['pos'];
  readonly sources: { readonly itemType: string; readonly count: number }[];
}

interface CaseVisual {
  readonly meshes: InstancedMesh[];
  planKey: string | undefined;
}

export class PileMeshes {
  readonly group = new Group();
  private readonly geometry = new BoxGeometry(1, 1, 1);
  private readonly material = withHeightFog(new MeshLambertMaterial({ color: 0x5a_50_46 }), 'piles');
  private readonly glowstickGeometry: BoxGeometry;
  private readonly glowstickMaterial = new MeshBasicMaterial({ color: 0xff_ff_ff, vertexColors: true });
  private glowsticks: InstancedMesh;
  private readonly blockSize: number;
  private readonly models: ModelLibrary | undefined;
  private readonly seed: number;
  private drawn = '';
  private readonly caseVisuals = new Map<string, CaseVisual>();

  constructor(blockSize: number, models?: ModelLibrary, seed = 1) {
    this.blockSize = blockSize;
    this.models = models;
    this.seed = seed;
    this.glowstickGeometry = new BoxGeometry(blockSize * 0.36, blockSize * 0.06, blockSize * 0.06);
    this.glowsticks = new InstancedMesh(this.glowstickGeometry, this.glowstickMaterial, 1);
  }

  /** Rebuilds ordinary pile meshes when inventory or models changed; case scatter stays instanced. */
  sync(inventory: Inventory): void {
    const version = `${inventory.version}:${this.models?.version ?? 0}`;
    if (version === this.drawn) {
      return;
    }
    this.drawn = version;
    this.group.clear();
    const casePlans = new Map<string, CasePlan>();
    for (const pile of inventory.piles.values()) {
      this.drawPile(inventory, pile, casePlans);
    }
    const visibleCaseVisuals = new Set<string>();
    for (const plan of casePlans.values()) {
      this.drawCasePlan(plan, visibleCaseVisuals);
    }
    this.drawEmissiveLights(inventory);
    if (this.glowsticks.count > 0) {
      this.group.add(this.glowsticks);
    }
    for (const [key, visual] of this.caseVisuals) {
      if (visibleCaseVisuals.has(key)) {
        continue;
      }
      this.releaseCaseVisual(visual);
      this.caseVisuals.delete(key);
    }
  }

  /** Releases owned instanced buffers; model geometry and materials remain shared with ModelLibrary. */
  dispose(): void {
    for (const visual of this.caseVisuals.values()) {
      this.releaseCaseVisual(visual);
    }
    this.caseVisuals.clear();
    this.group.clear();
    this.geometry.dispose();
    this.material.dispose();
    this.glowstickGeometry.dispose();
    this.glowstickMaterial.dispose();
    this.drawn = '';
  }

  private drawPile(inventory: Inventory, pile: Pile, casePlans: Map<string, CasePlan>): void {
    const regularPile = {
      ...pile,
      items: pile.items.filter(
        ({ item }) => defOf(inventory.registry, item.type).pileDisplay !== PILE_DISPLAY_KIND.scatter,
      ),
    };
    const layout = pileLayout(inventory.registry, regularPile, this.blockSize, (id) => this.models?.has(id) ?? false);
    this.drawModels(inventory, layout.models);
    this.planSpentCases(inventory, pile, casePlans);
    this.drawBundle(inventory, pile, layout.bundle);
  }

  /** Each item as its own look, so a rifle on the ground shows the magazine it really has. */
  private drawModels(inventory: Inventory, models: ReturnType<typeof pileLayout>['models']): void {
    for (const piled of models) {
      const look = itemLook(inventory.registry, piled.placed.item);
      const model = look && this.models?.groundLook(look);
      if (!model) {
        continue;
      }
      model.position.set(...piled.at);
      model.rotation.y = piled.yaw;
      this.group.add(castsAndReceives(model));
    }
  }

  private planSpentCases(inventory: Inventory, pile: Pile, plans: Map<string, CasePlan>): void {
    const caseCounts = new Map<string, number>();
    for (const { item } of pile.items) {
      if (defOf(inventory.registry, item.type).pileDisplay !== PILE_DISPLAY_KIND.scatter) {
        continue;
      }
      caseCounts.set(item.type, (caseCounts.get(item.type) ?? 0) + item.count);
    }
    let shownCases = 0;
    const pileKey = pile.pos.join(',');
    const caseTypes = [...caseCounts].sort(([a], [b]) => a.localeCompare(b));
    for (const [itemType, count] of caseTypes) {
      const visibleCount = Math.min(count, SPENT_CASE_SCATTER_CAP - shownCases);
      if (visibleCount === 0) {
        break;
      }
      const modelId = defOf(inventory.registry, itemType).model;
      const key = `${pileKey}\u001f${modelId ?? ''}`;
      let plan = plans.get(key);
      if (!plan) {
        plan = { key, modelId, pilePos: pile.pos, sources: [] };
        plans.set(key, plan);
      }
      plan.sources.push({ itemType, count: visibleCount });
      shownCases += visibleCount;
    }
  }

  private drawCasePlan(plan: CasePlan, visibleCaseVisuals: Set<string>): void {
    const parts = plan.modelId ? this.models?.groundParts(plan.modelId) : undefined;
    const fallback = !parts?.length;
    const visualKey = `${plan.key}\u001f${fallback ? 'fallback' : 'model'}`;
    visibleCaseVisuals.add(visualKey);
    let visual = this.caseVisuals.get(visualKey);
    if (!visual) {
      visual = {
        meshes: this.createCaseMeshes(parts, fallback),
        planKey: undefined,
      };
      this.caseVisuals.set(visualKey, visual);
    }
    const planKey = plan.sources.map(({ itemType, count }) => `${itemType}:${count}`).join('|');
    if (visual.planKey !== planKey) {
      const poses = plan.sources.flatMap(({ itemType, count }) =>
        spentCaseScatter({
          worldSeed: this.seed,
          pilePos: plan.pilePos,
          count,
          blockSize: this.blockSize,
          key: itemType,
        }),
      );
      this.updateCaseMatrices(visual.meshes, poses, parts, fallback);
      visual.planKey = planKey;
    }
    for (const mesh of visual.meshes) {
      mesh.visible = mesh.count > 0;
      this.group.add(castsAndReceives(mesh));
    }
  }

  private createCaseMeshes(parts: readonly GroundModelPart[] | undefined, fallback: boolean): InstancedMesh[] {
    if (fallback) {
      return [new InstancedMesh(CASE_PLACEHOLDER_GEOMETRY, CASE_PLACEHOLDER_MATERIAL, SPENT_CASE_SCATTER_CAP)];
    }
    return parts!.map((part) => new InstancedMesh(part.geometry, part.material, SPENT_CASE_SCATTER_CAP));
  }

  private updateCaseMatrices(
    meshes: readonly InstancedMesh[],
    poses: readonly CasePose[],
    parts: readonly GroundModelPart[] | undefined,
    fallback: boolean,
  ): void {
    const transform = new Object3D();
    const matrix = new Matrix4();
    for (const [partIndex, mesh] of meshes.entries()) {
      mesh.count = poses.length;
      for (let index = 0; index < poses.length; index++) {
        const pose = poses[index]!;
        transform.position.set(...pose.position);
        transform.rotation.set(...pose.rotation);
        transform.updateMatrix();
        if (fallback) {
          matrix.copy(transform.matrix);
        } else {
          matrix.multiplyMatrices(transform.matrix, parts![partIndex]!.matrix);
        }
        mesh.setMatrixAt(index, matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (poses.length > 0) {
        mesh.computeBoundingSphere();
      }
    }
  }

  private releaseCaseVisual(visual: CaseVisual): void {
    for (const mesh of visual.meshes) {
      mesh.dispose();
    }
  }

  private drawEmissiveLights(inventory: Inventory): void {
    const sources = [...inventory.piles.values()].flatMap((pile) =>
      pile.items.flatMap(({ item }) => {
        const { light } = defOf(inventory.registry, item.type);
        return item.on && light?.emissive !== undefined && light.burning?.drop === 'stay' ? [{ pile, light }] : [];
      }),
    );
    if (sources.length > this.glowsticks.count) {
      this.glowsticks.dispose();
      this.glowsticks = new InstancedMesh(this.glowstickGeometry, this.glowstickMaterial, sources.length);
    }
    this.glowsticks.count = sources.length;
    const transform = new Object3D();
    for (const [index, { pile, light }] of sources.entries()) {
      transform.position.set(
        (pile.pos[0] + 0.5) * this.blockSize,
        (pile.pos[1] + 0.15) * this.blockSize,
        (pile.pos[2] + 0.5) * this.blockSize,
      );
      transform.rotation.set(0, (index * Math.PI) / 4, 0);
      transform.updateMatrix();
      this.glowsticks.setMatrixAt(index, transform.matrix);
      const color = new Color(light.color).multiplyScalar(light.emissive!);
      this.glowsticks.setColorAt(index, color);
    }
    this.glowsticks.instanceMatrix.needsUpdate = true;
    if (this.glowsticks.instanceColor) {
      this.glowsticks.instanceColor.needsUpdate = true;
    }
  }

  private drawBundle(inventory: Inventory, pile: Pile, bundle: ReturnType<typeof pileLayout>['bundle']): void {
    if (bundle.length === 0) {
      return;
    }
    const cells = bundle.reduce((sum, placed) => {
      const [width, height] = defOf(inventory.registry, placed.item.type).size;
      return sum + width * height;
    }, 0);
    const capacity = PILE_GRID.w * PILE_GRID.h;
    const height = 0.06 + 0.18 * Math.min(1, cells / capacity);
    const mesh = new Mesh(this.geometry, this.material);
    mesh.scale.set(this.blockSize * 0.7, height, this.blockSize * 0.7);
    mesh.position.set(
      (pile.pos[0] + 0.5) * this.blockSize,
      pile.pos[1] * this.blockSize + height / 2,
      (pile.pos[2] + 0.5) * this.blockSize,
    );
    this.group.add(castsAndReceives(mesh));
  }
}
