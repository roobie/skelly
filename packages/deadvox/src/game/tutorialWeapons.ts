import type { Registry } from '../core/content.ts';
import { defOf, type Item } from '../core/items.ts';
import type { FirearmOutcome } from './firearmHandling.ts';

export type PracticeGun = 'revolver' | 'pump';
export type WeaponLesson = 'unpack' | 'wield' | 'inspect' | 'partial' | 'ready' | 'reload' | 'sighted' | 'unload';

interface Progress {
  kind: PracticeGun;
  facts: Set<WeaponLesson>;
  shot: boolean;
  caseRemoved: boolean;
  reloaded: boolean;
  liveEjected: boolean;
  insertedSinceClosure: boolean;
}

/** Passive, per-instance facts: swapping guns cannot splice together a handling sequence. */
export class TutorialWeapons {
  private readonly guns = new Map<number, Progress>();
  private readonly unpacked = new Set<string>();
  melee = false;

  unpackedAmmo(type: string): void {
    this.unpacked.add(type);
  }

  private progress(item: Item, registry: Registry): Progress | undefined {
    const { firearm } = defOf(registry, item.type);
    let kind: PracticeGun | undefined;
    if (firearm?.revolver) {
      kind = 'revolver';
    } else if (firearm?.pump) {
      kind = 'pump';
    }
    if (!kind) {
      return;
    }
    let progress = this.guns.get(item.uid);
    if (!progress) {
      progress = {
        kind,
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
    if (event === 'load' && progress.shot && (progress.kind === 'pump' || progress.caseRemoved)) {
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

  lesson(kind: PracticeGun): WeaponLesson | undefined {
    const candidates = [...this.guns.values()].filter((gun) => gun.kind === kind);
    const lessons: WeaponLesson[] = ['unpack', 'wield', 'inspect', 'partial', 'ready', 'reload', 'sighted', 'unload'];
    const next = (gun: Progress) => lessons.find((lesson) => !gun.facts.has(lesson));
    if (candidates.some((gun) => next(gun) === undefined)) {
      return;
    }
    if (candidates.length === 0) {
      return 'unpack';
    }
    return next(candidates.reduce((a, b) => (a.facts.size >= b.facts.size ? a : b)));
  }
}
