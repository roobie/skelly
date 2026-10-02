// Piles on the ground (DESIGN.md, "Piles"). An item with a model lies at its place in
// the pile's grid (core/pileLayout.ts); everything else is one low bundle per pile,
// taller the more it holds.

import { BoxGeometry, Group, InstancedMesh, Mesh, MeshLambertMaterial, Object3D } from 'three';
import { type Inventory, PILE_GRID, type Pile } from '../core/inventory.ts';
import { defOf } from '../core/items.ts';
import { pileLayout } from '../core/pileLayout.ts';
import { CASE_PLACEHOLDER_GEOMETRY, CASE_PLACEHOLDER_MATERIAL, resolveCaseModel } from './caseVisual.ts';
import { withHeightFog } from './heightFog.ts';
import type { ModelLibrary } from './models.ts';
import { castsAndReceives } from './shadowFlags.ts';
import { SPENT_CASE_ITEM_PREFIX, SPENT_CASE_SCATTER_CAP, spentCaseScatter } from './spentCaseScatter.ts';

export class PileMeshes {
  readonly group = new Group();
  private readonly geometry = new BoxGeometry(1, 1, 1);
  private readonly material = withHeightFog(new MeshLambertMaterial({ color: 0x5a_50_46 }), 'piles');
  private readonly blockSize: number;
  private readonly models: ModelLibrary | undefined;
  private readonly seed: number;
  private drawn = '';

  constructor(blockSize: number, models?: ModelLibrary, seed = 1) {
    this.blockSize = blockSize;
    this.models = models;
    this.seed = seed;
  }

  /** Rebuilds the meshes when the inventory changed or a model loaded. */
  sync(inventory: Inventory): void {
    const version = `${inventory.version}:${this.models?.version ?? 0}`;
    if (version === this.drawn) {
      return;
    }
    this.drawn = version;
    this.group.clear();
    const fallbackCases: ReturnType<typeof spentCaseScatter> = [];
    for (const pile of inventory.piles.values()) {
      this.drawPile(inventory, pile, fallbackCases);
    }
    this.drawFallbackCases(fallbackCases);
  }

  private drawPile(inventory: Inventory, pile: Pile, fallbackCases: ReturnType<typeof spentCaseScatter>): void {
    const regularPile = {
      ...pile,
      items: pile.items.filter(({ item }) => !item.type.startsWith(SPENT_CASE_ITEM_PREFIX)),
    };
    const layout = pileLayout(inventory.registry, regularPile, this.blockSize, (id) => this.models?.has(id) ?? false);
    this.drawModels(layout.models);
    this.drawSpentCases(inventory, pile, fallbackCases);
    this.drawBundle(inventory, pile, layout.bundle);
  }

  private drawModels(models: ReturnType<typeof pileLayout>['models']): void {
    for (const piled of models) {
      const model = this.models?.ground(piled.model);
      if (!model) {
        continue;
      }
      model.position.set(...piled.at);
      model.rotation.y = piled.yaw;
      this.group.add(castsAndReceives(model));
    }
  }

  private drawSpentCases(inventory: Inventory, pile: Pile, fallbackCases: ReturnType<typeof spentCaseScatter>): void {
    const caseCounts = new Map<string, number>();
    for (const { item } of pile.items) {
      if (!item.type.startsWith(SPENT_CASE_ITEM_PREFIX)) {
        continue;
      }
      caseCounts.set(item.type, (caseCounts.get(item.type) ?? 0) + item.count);
    }
    let shownCases = 0;
    const caseTypes = [...caseCounts].sort(([a], [b]) => a.localeCompare(b));
    for (const [itemType, count] of caseTypes) {
      const caseItemModel = defOf(inventory.registry, itemType).model;
      const scatter = spentCaseScatter({
        worldSeed: this.seed,
        pilePos: pile.pos,
        count: Math.min(count, SPENT_CASE_SCATTER_CAP - shownCases),
        blockSize: this.blockSize,
        key: itemType,
      });
      shownCases += scatter.length;
      for (const pose of scatter) {
        const model = resolveCaseModel(this.models, caseItemModel);
        if (!model) {
          fallbackCases.push(pose);
          continue;
        }
        model.position.set(...pose.position);
        model.rotation.set(...pose.rotation);
        this.group.add(model);
      }
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

  private drawFallbackCases(fallbackCases: ReturnType<typeof spentCaseScatter>): void {
    if (fallbackCases.length === 0) {
      return;
    }
    const instanced = new InstancedMesh(CASE_PLACEHOLDER_GEOMETRY, CASE_PLACEHOLDER_MATERIAL, fallbackCases.length);
    const transform = new Object3D();
    fallbackCases.forEach(({ position, rotation }, index) => {
      transform.position.set(...position);
      transform.rotation.set(...rotation);
      transform.updateMatrix();
      instanced.setMatrixAt(index, transform.matrix);
    });
    instanced.instanceMatrix.needsUpdate = true;
    instanced.castShadow = true;
    this.group.add(castsAndReceives(instanced));
  }
}
