// Piles on the ground (`DESIGN.md`, "Piles and item models"). An item with a model lies at its place in
// the pile's grid (core/pileLayout.ts); everything else is one low bundle per pile,
// taller the more it holds.

import {
  Box3,
  BoxGeometry,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  Vector3,
} from 'three';
import type { Inventory } from '../core/inventory.ts';
import { defOf, type Item, type Placed } from '../core/items.ts';
import { type EffectivePileDisplay, effectivePileDisplays } from '../core/pileDisplay.ts';
import { PILE_BUNDLE_WIDTH } from '../core/pileLayout.ts';
import type { PileScatterPlacement } from '../core/scatterPile.ts';
import { SPENT_CASE_SCATTER_CAP } from '../core/scatterPile.ts';
import { CASE_PLACEHOLDER_GEOMETRY, CASE_PLACEHOLDER_MATERIAL } from './caseVisual.ts';
import type { ColumnReveal } from './columnReveal.ts';
import { withHeightFog } from './heightFog.ts';
import { applyItemEmissive, disposeItemEmissiveMaterials } from './itemEmissive.ts';
import { itemLook } from './itemLook.ts';
import { ModelFlames } from './modelFlame.ts';
import { type GroundModelPart, groundModelFrame, LENS, type ModelLibrary } from './models.ts';
import { castsAndReceives } from './shadowFlags.ts';

interface CasePose {
  readonly position: readonly [number, number, number];
  readonly rotation: readonly [number, number, number];
}

interface CasePlan {
  readonly key: string;
  readonly modelId: string | undefined;
  readonly sources: { readonly itemType: string; count: number }[];
  readonly poses: CasePose[];
  readonly itemUids: number[];
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
  private readonly glowstickMaterial = new MeshBasicMaterial({ color: 0xff_ff_ff, toneMapped: false });
  private glowsticks: InstancedMesh;
  private readonly blockSize: number;
  private readonly models: ModelLibrary | undefined;
  private readonly seed: number;
  private readonly reveal: ColumnReveal | undefined;
  private drawn = '';
  private readonly itemBounds = new Map<number, Box3>();
  private readonly flames = new ModelFlames('pile-light-flame');
  /** Where each drawn flame burns, in world metres. */
  private readonly flamePositions = new Map<number, Vector3>();

  private readonly beamLenses = new Map<number, Object3D>();

  beamPoseOf(item: Item, position: Vector3, direction: Vector3): boolean {
    const lens = this.beamLenses.get(item.uid);
    if (!lens) {
      return false;
    }
    lens.getWorldPosition(position);
    direction.set(0, 0, -1).transformDirection(lens.matrixWorld);
    return true;
  }

  /** Sets `out` to where a lit item on the ground burns, if it is drawn with a flame. */
  lightPositionOf(item: Item, out: Vector3): boolean {
    const at = this.flamePositions.get(item.uid);
    if (!at) {
      return false;
    }
    out.copy(at);
    return true;
  }

  boundsFor(uid: number): { position: [number, number, number]; size: [number, number, number] } | undefined {
    const bounds = this.itemBounds.get(uid);
    return (
      bounds && {
        position: bounds.getCenter(new Vector3()).toArray(),
        size: bounds.getSize(new Vector3()).toArray(),
      }
    );
  }
  private readonly caseVisuals = new Map<string, CaseVisual>();

  constructor(blockSize: number, models?: ModelLibrary, seed = 1, reveal?: ColumnReveal) {
    this.blockSize = blockSize;
    this.models = models;
    this.seed = seed;
    this.reveal = reveal;
    this.glowstickGeometry = new BoxGeometry(blockSize * 0.36, blockSize * 0.06, blockSize * 0.06);
    this.glowsticks = new InstancedMesh(this.glowstickGeometry, this.glowstickMaterial, 1);
  }

  /** Rebuilds pile meshes when inventory, models, or transient throw visibility changed. */
  sync(inventory: Inventory, hiddenItemUids: ReadonlySet<number> = new Set()): void {
    const hidden = [...hiddenItemUids].sort((a, b) => a - b).join(',');
    const version = `${inventory.version}:${this.models?.version ?? 0}:${hidden}:${this.reveal?.revealVersion ?? 0}`;
    if (version === this.drawn) {
      return;
    }
    this.drawn = version;
    this.beamLenses.clear();
    this.itemBounds.clear();
    this.flamePositions.clear();
    disposeItemEmissiveMaterials(this.group);
    this.group.clear();
    const casePlans = new Map<string, CasePlan>();
    const displays = effectivePileDisplays(inventory, {
      blockSize: this.blockSize,
      worldSeed: this.seed,
      hasModel: (id) => this.models?.has(id) ?? false,
      hiddenItemUids,
    });
    for (const display of displays.values()) {
      if (this.reveal && !this.reveal.isRevealed(display.visiblePile.pos[0], display.visiblePile.pos[2])) {
        continue;
      }
      this.drawPile(inventory, display, casePlans);
    }
    const visibleCaseVisuals = new Set<string>();
    for (const plan of casePlans.values()) {
      this.drawCasePlan(plan, visibleCaseVisuals);
    }
    this.drawEmissiveLights(inventory, hiddenItemUids);
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
    this.beamLenses.clear();
    this.itemBounds.clear();
    this.flamePositions.clear();
    disposeItemEmissiveMaterials(this.group);
    this.group.clear();
    this.flames.dispose();
    this.geometry.dispose();
    this.material.dispose();
    this.glowstickGeometry.dispose();
    this.glowstickMaterial.dispose();
    this.drawn = '';
  }

  private drawPile(inventory: Inventory, display: EffectivePileDisplay, casePlans: Map<string, CasePlan>): void {
    this.drawModels(inventory, display.layout.models);
    this.planSpentCases(inventory, display.visiblePile.pos.join(','), display.scatter, casePlans);
    if (display.bundlePosition && display.bundleHeight !== undefined) {
      this.drawBundle(display.layout.bundle, display.bundlePosition, display.bundleHeight);
    }
  }

  /** Each item as its own look, so a rifle on the ground shows the magazine it really has. */
  private drawModels(inventory: Inventory, models: EffectivePileDisplay['layout']['models']): void {
    for (const piled of models) {
      const { placed, at, yaw } = piled;
      const { item } = placed;
      const definition = defOf(inventory.registry, item.type);
      const look = itemLook(inventory.registry, item);
      const model = look && this.models?.groundLook(look);
      if (!model) {
        continue;
      }
      applyItemEmissive(
        model,
        item,
        definition,
        definition.model ? inventory.registry.models.get(definition.model) : undefined,
      );
      model.position.set(...at);
      model.rotation.y = yaw;
      this.group.add(castsAndReceives(model));
      this.itemBounds.set(item.uid, new Box3().setFromObject(model));
      const lens = model.getObjectByName(LENS);
      if (lens) {
        const remember = (part: Item): void => {
          if (defOf(inventory.registry, part.type).light?.beam) {
            this.beamLenses.set(part.uid, lens);
          }
          for (const child of Object.values(part.slots ?? {})) {
            if (child) {
              remember(child);
            }
          }
        };
        remember(item);
      }
      const flame = this.flames.onModel(inventory.registry, item, model, groundModelFrame);
      if (flame) {
        this.flamePositions.set(item.uid, flame);
      }
    }
  }

  private planSpentCases(
    inventory: Inventory,
    pileKey: string,
    placements: readonly PileScatterPlacement[],
    plans: Map<string, CasePlan>,
  ): void {
    for (const { item, position, rotation } of placements) {
      const modelId = defOf(inventory.registry, item.type).model;
      const key = `${pileKey}\u001f${modelId ?? ''}`;
      let plan = plans.get(key);
      if (!plan) {
        plan = { key, modelId, sources: [], poses: [], itemUids: [] };
        plans.set(key, plan);
      }
      const source = plan.sources.find(({ itemType }) => itemType === item.type);
      if (source) {
        source.count += 1;
      } else {
        plan.sources.push({ itemType: item.type, count: 1 });
      }
      plan.poses.push({ position, rotation });
      plan.itemUids.push(item.uid);
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
      this.updateCaseMatrices(visual.meshes, plan.poses, parts, fallback);
      visual.planKey = planKey;
    }
    for (const mesh of visual.meshes) {
      mesh.visible = mesh.count > 0;
      this.group.add(castsAndReceives(mesh));
      if (!mesh.geometry.boundingBox) {
        mesh.geometry.computeBoundingBox();
      }
      const matrix = new Matrix4();
      for (const [index, uid] of plan.itemUids.entries()) {
        mesh.getMatrixAt(index, matrix);
        const bounds = mesh.geometry.boundingBox!.clone().applyMatrix4(matrix);
        const prior = this.itemBounds.get(uid);
        if (prior) {
          prior.union(bounds);
        } else {
          this.itemBounds.set(uid, bounds);
        }
      }
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

  private drawEmissiveLights(inventory: Inventory, hiddenItemUids: ReadonlySet<number>): void {
    const sources = [...inventory.piles.values()].flatMap((pile) =>
      pile.items.flatMap(({ item }) => {
        if (hiddenItemUids.has(item.uid) || (this.reveal && !this.reveal.isRevealed(pile.pos[0], pile.pos[2]))) {
          return [];
        }
        const definition = defOf(inventory.registry, item.type);
        const { light } = definition;
        const bundleVisible = definition.model === undefined || !this.models?.has(definition.model);
        return item.on && bundleVisible && light?.emissive !== undefined && light.burning?.drop === 'stay'
          ? [{ pile, light, uid: item.uid }]
          : [];
      }),
    );
    if (sources.length > this.glowsticks.count) {
      this.glowsticks.dispose();
      this.glowsticks = new InstancedMesh(this.glowstickGeometry, this.glowstickMaterial, sources.length);
    }
    this.glowsticks.count = sources.length;
    const transform = new Object3D();
    for (const [index, { pile, light, uid }] of sources.entries()) {
      transform.position.set(
        (pile.pos[0] + 0.5) * this.blockSize,
        (pile.pos[1] + 0.15) * this.blockSize,
        (pile.pos[2] + 0.5) * this.blockSize,
      );
      transform.rotation.set(0, (index * Math.PI) / 4, 0);
      transform.updateMatrix();
      this.glowsticks.setMatrixAt(index, transform.matrix);
      if (!this.glowstickGeometry.boundingBox) {
        this.glowstickGeometry.computeBoundingBox();
      }
      const bounds = this.glowstickGeometry.boundingBox!.clone().applyMatrix4(transform.matrix);
      const prior = this.itemBounds.get(uid);
      if (prior) {
        prior.union(bounds);
      } else {
        this.itemBounds.set(uid, bounds);
      }
      const color = new Color(light.color).multiplyScalar(light.emissive!);
      this.glowsticks.setColorAt(index, color);
    }
    this.glowsticks.instanceMatrix.needsUpdate = true;
    if (this.glowsticks.instanceColor) {
      this.glowsticks.instanceColor.needsUpdate = true;
    }
  }

  private drawBundle(bundle: readonly Placed[], position: readonly [number, number, number], height: number): void {
    if (bundle.length === 0) {
      return;
    }
    const mesh = new Mesh(this.geometry, this.material);
    mesh.scale.set(this.blockSize * PILE_BUNDLE_WIDTH, height, this.blockSize * PILE_BUNDLE_WIDTH);
    mesh.position.set(...position);
    this.group.add(castsAndReceives(mesh));
    const bounds = new Box3().setFromObject(mesh);
    for (const { item } of bundle) {
      this.itemBounds.set(item.uid, bounds);
    }
  }
}
