import { Group, type Object3D } from 'three';
import type { FigureDef, ItemDef, Registry } from '../core/content.ts';
import type { Vec3 } from '../core/coords.ts';
import { defOf, type Item } from '../core/items.ts';
import type { WearSlot } from '../core/schema.ts';
import { type ItemLook, itemLook, itemStateLook } from './itemLook.ts';
import { applyItemStateLook, disposeItemStateMaterials } from './itemStateLook.ts';
import type { ModelLibrary } from './models.ts';
import type { WornPresentation } from './playerFigure.ts';
import { castsAndReceives } from './shadowFlags.ts';

type Entry = NonNullable<ItemDef['figureModels']>[number];
interface WornEntry {
  owner: Item;
  entry: Entry;
  look?: ItemLook;
}
interface Attachment {
  group: Group;
  covered: Object3D[];
}

const wornEntries = (registry: Registry, item: Item, fit?: string): WornEntry[] =>
  [item, ...Object.values(item.slots ?? {}).filter((child): child is Item => child !== undefined)].flatMap((owner) => {
    const look = itemLook(registry, owner);
    return (defOf(registry, owner.type).figureModels ?? []).map((authored) => {
      const model = fit && authored.overTorso ? authored.overTorso[fit]! : authored.model;
      const entry = model === authored.model ? authored : { ...authored, model };
      const state = itemStateLook(registry, owner, entry.model);
      const partLook =
        look && entry.model === look.model
          ? look
          : {
              model: entry.model,
              slots: [],
              hidden: [],
              state,
              key: JSON.stringify([entry.model, state]),
            };
      return { owner, entry, look: partLook };
    });
  });

export class WornModels {
  private readonly figure: FigureDef;
  private readonly models: ModelLibrary;
  private readonly frames: ReadonlyMap<string, Group>;
  private readonly baseParts: ReadonlyMap<string, readonly Object3D[]>;
  private readonly attachments = new Map<WearSlot, { item: Item; key: string; groups: Attachment[] }>();

  constructor(
    figure: FigureDef,
    models: ModelLibrary,
    frames: ReadonlyMap<string, Group>,
    baseParts: ReadonlyMap<string, readonly Object3D[]>,
  ) {
    this.figure = figure;
    this.models = models;
    this.frames = frames;
    this.baseParts = baseParts;
  }

  sync(source?: WornPresentation): void {
    const torso = source?.worn.torso;
    const fit = torso && defOf(source!.registry, torso.type).wearable?.figureFit;
    const slots = new Set([...this.attachments.keys(), ...(Object.keys(source?.worn ?? {}) as WearSlot[])]);
    for (const slot of slots) {
      const item = source?.worn[slot];
      const entries = item ? wornEntries(source!.registry, item, fit) : [];
      const available = entries.filter(({ entry }) => this.frames.has(entry.frame));
      const key = JSON.stringify([
        this.models.version,
        ...available.map(({ owner, entry, look }) => [owner.uid, owner.type, entry, look?.key]),
      ]);
      const previous = this.attachments.get(slot);
      if (previous && previous.item === item && previous.key === key && previous.groups.length === available.length) {
        continue;
      }
      for (const { group } of previous?.groups ?? []) {
        disposeItemStateMaterials(group);
        group.removeFromParent();
      }
      this.attachments.delete(slot);
      if (!item || available.length === 0) {
        continue;
      }
      const groups = available.flatMap((entry) => this.attach(slot, entry, source!.registry) ?? []);
      this.attachments.set(slot, { item, key, groups });
    }
    this.syncCoverage();
  }

  private syncCoverage(): void {
    for (const nodes of this.baseParts.values()) {
      for (const node of nodes) {
        node.visible = true;
      }
    }
    for (const { groups } of this.attachments.values()) {
      for (const { covered } of groups) {
        for (const node of covered) {
          node.visible = false;
        }
      }
    }
  }

  clear(): void {
    this.sync();
  }

  groupsOf(slot: WearSlot): readonly Group[] {
    return this.attachments.get(slot)?.groups.map(({ group }) => group) ?? [];
  }

  modelOf(item: Item): Group | undefined {
    const contains = (candidate: Item): boolean =>
      candidate === item ||
      Object.values(candidate.slots ?? {}).some((child) => child !== undefined && contains(child));
    return [...this.attachments.values()].find((entry) => contains(entry.item))?.groups[0]?.group;
  }

  private attach(slot: WearSlot, { entry, look }: WornEntry, registry: Registry): Attachment | undefined {
    const frame = this.frames.get(entry.frame);
    // Self-model entries keep the whole item look, including parts fitted to a slung gun.
    const model = frame && (look ? this.models.partLook(look) : this.models.part(entry.model));
    if (!(frame && model)) {
      return;
    }
    if (look) {
      applyItemStateLook(model, look, registry);
    }
    // Keep the authored item pivot on the frame even when the model is turned.
    model.position.set(...entry.pivot).negate();
    const attachment = new Group();
    attachment.name = `worn-${slot}`;
    attachment.position.set(...entry.at);
    attachment.rotation.set(...(entry.turn.map((degrees) => (degrees * Math.PI) / 180) as Vec3));
    attachment.add(model);
    attachment.traverse((object) => {
      object.layers.mask = frame.layers.mask;
    });
    frame.add(castsAndReceives(attachment));
    const { part } = this.figure.attachmentFrames[entry.frame]!;
    const covered = (entry.covers ?? []).flatMap((name) => this.baseParts.get(`${part}/${name}`) ?? []);
    return { group: attachment, covered };
  }
}
