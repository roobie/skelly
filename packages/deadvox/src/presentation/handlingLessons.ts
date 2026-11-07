import type { Registry } from '../core/content.ts';
import type { HandlingFact } from '../core/guidanceFacts.ts';
import { defOf, type Item } from '../core/items.ts';
import type { GuidanceDef } from '../core/schema/guidance.ts';
import type { FirearmOutcome } from './firearmHandling.ts';

type Track = GuidanceDef['handling'][number];

interface Progress {
  track: Track;
  facts: Set<HandlingFact>;
  shot: boolean;
  caseRemoved: boolean;
  reloaded: boolean;
  liveEjected: boolean;
  insertedSinceClosure: boolean;
}

/** Passive, per-instance facts: swapping guns cannot splice together a handling sequence. */
export class HandlingLessons {
  private readonly guns = new Map<number, Progress>();
  private readonly unpacked = new Set<string>();

  private readonly tracks: GuidanceDef['handling'];

  constructor(tracks: GuidanceDef['handling']) {
    this.tracks = tracks;
  }

  unpackedAmmo(type: string): void {
    this.unpacked.add(type);
  }

  private progress(item: Item, registry: Registry): Progress | undefined {
    const { firearm } = defOf(registry, item.type);
    const track = this.tracks.find(({ mechanism }) => firearm?.[mechanism]);
    if (!track) {
      return;
    }
    let progress = this.guns.get(item.uid);
    if (!progress) {
      progress = {
        track,
        facts: new Set(),
        shot: false,
        caseRemoved: false,
        reloaded: false,
        liveEjected: false,
        insertedSinceClosure: false,
      };
      this.guns.set(item.uid, progress);
    }
    const model = registry.models.get(defOf(registry, item.type).model!);
    if ([...this.unpacked].some((type) => registry.items.get(type)?.ammo?.calibre === model?.gun?.calibre)) {
      progress.facts.add('unpack');
    }
    return progress;
  }

  wielded(item: Item, registry: Registry): void {
    this.progress(item, registry)?.facts.add('wield');
  }

  inspected(item: Item, registry: Registry): void {
    this.progress(item, registry)?.facts.add('inspect');
  }

  handling(item: Item, event: FirearmOutcome, registry: Registry): void {
    const progress = this.progress(item, registry);
    if (!progress) {
      return;
    }
    if (event === 'case-ejected' && progress.shot) {
      progress.caseRemoved = true;
    }
    if (event === 'load') {
      progress.insertedSinceClosure = true;
    }
    if (event === 'load' && progress.shot && (!progress.track.reloadRequiresCaseRemoval || progress.caseRemoved)) {
      progress.reloaded = true;
    }
    if (event === 'live-ejected') {
      progress.liveEjected = true;
    }
    if (event === 'close' || event === 'cycle') {
      this.closed(item, progress, registry, event);
    }
    if (event === 'close') {
      progress.insertedSinceClosure = false;
    }
  }

  private closed(item: Item, progress: Progress, registry: Registry, event: FirearmOutcome): void {
    const state = item.firearm;
    const live = state?.cylinder
      ? state.cylinder.chambers.filter((chamber) => chamber.state === 'round').length
      : (state?.tube?.length ?? 0) + Number(state?.chamber === 'round');
    const capacity =
      state?.cylinder?.chambers.length ??
      registry.models.get(defOf(registry, item.type).model!)!.gun!.internalMagazine!.capacity;
    const partialLoadCompleted = state?.cylinder
      ? event === 'close' && !state.cylinder.open && progress.insertedSinceClosure
      : state?.chamber === 'round';
    if (live > 0 && live < capacity && partialLoadCompleted) {
      progress.facts.add('partial');
    }
    if (live === 0 && progress.liveEjected) {
      progress.facts.add('unload');
    }
  }

  discharged(item: Item, sighted: boolean, registry: Registry): void {
    const progress = this.progress(item, registry);
    if (!progress) {
      return;
    }
    progress.facts.add(sighted ? 'sighted' : 'ready');
    if (progress.reloaded) {
      progress.facts.add('reload');
    }
    progress.shot = true;
  }

  lesson(trackId: string): string | undefined {
    const track = this.tracks.find(({ id }) => id === trackId);
    if (!track) {
      throw new Error(`Unknown handling track "${trackId}"`);
    }
    const candidates = [...this.guns.values()].filter((gun) => gun.track === track);
    const next = (gun: Progress) =>
      track.lessons.find((lesson) => !lesson.facts.every((fact) => gun.facts.has(fact)))?.id;
    if (candidates.some((gun) => next(gun) === undefined)) {
      return;
    }
    if (candidates.length === 0) {
      return track.lessons[0]!.id;
    }
    return next(candidates.reduce((a, b) => (a.facts.size >= b.facts.size ? a : b)));
  }
}
