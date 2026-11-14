// Transient keyboard intent only. Existing HandlingQueue owns shell/rack jobs.
/**
 * Real milliseconds. A press held for `hold` loads; a second press starting within `doublePress` of a tap racks
 * if released before `hold`. Held for `hold`, it removes the magazine, or on a gun without one keeps racking. On a gun
 * with a press check, a third press starting within `thirdPress` of the second's release and held for `hold` checks
 * the chamber instead of the rack (`packages/deadvox/CONTROLS.md`, "Reload, rack, remove").
 */
export const RELOAD_GESTURE_MS = { hold: 250, doublePress: 250, thirdPress: 250 } as const;

export interface ReloadBinding {
  readonly uid: number;
  readonly busy: () => boolean;
  /** True only when a single-shell job was admitted. */
  readonly load: () => boolean;
  /** One admitted load per press, which release doesn't cancel: a magazine change rather than shell by shell. */
  readonly oneAction?: boolean;
  /** True only when the rack was admitted. */
  readonly rack: () => boolean;
  readonly remove: () => void;
  /**
   * Only on a gun with a press check: true only when it was admitted. Its presence holds a released second press's
   * rack until no third press follows, since racking first would eject the round the check is for.
   */
  readonly pressCheck?: () => boolean;
  /**
   * Only on a gun without a detachable magazine, such as the pump: whether a rack would still take anything out. A
   * held second press racks instead of removing, and racks again after each rack while this holds.
   */
  readonly stillLoaded?: () => boolean;
  readonly cancelLoad: () => void;
  readonly releaseLoad?: () => void;
}

/** A handling owner R can drive: firearm mechanics or magazine handling. */
interface ReloadOwner {
  readonly reloadableUid: () => number | undefined;
  readonly loadNext: (uid: number, time: number) => string | undefined;
  readonly cancelLoad: (uid: number) => void;
}

/** What R acts on; each action returns its refusal. Play adds refusal display and replay recording. */
export interface ReloadTarget {
  readonly uid: number;
  readonly oneAction: boolean;
  readonly load: (time: number) => string | undefined;
  readonly rack: (time: number) => string | undefined;
  readonly remove: (time: number) => string | undefined;
  /** See `ReloadBinding.pressCheck`. */
  readonly pressCheck?: () => string | undefined;
  /** See `ReloadBinding.stillLoaded`. */
  readonly stillLoaded?: () => boolean;
  readonly cancelLoad: () => void;
  readonly releaseLoad?: (time: number) => void;
}

/** A held firearm takes R; otherwise a wielded magazine, which R only loads with rounds. */
export const reloadTarget = (
  firearms: ReloadOwner & {
    readonly reloadsInOneAction: (uid: number) => boolean;
    readonly cock: (uid: number, time: number) => string | undefined;
    readonly removeMagazine: (uid: number, time: number) => string | undefined;
    readonly stillLoaded: (uid: number) => boolean;
    readonly pressChecks: (uid: number) => boolean;
    readonly pressCheck: (uid: number) => string | undefined;
    readonly unloadsByRacking?: (uid: number) => boolean;
    readonly releaseLoad?: (uid: number, time: number) => void;
  },
  magazines: ReloadOwner,
  /** Why a wielded magazine can't be racked or have a magazine removed. */
  notHoldingGun: string,
): ReloadTarget | undefined => {
  const gun = firearms.reloadableUid();
  if (gun !== undefined) {
    const oneAction = firearms.reloadsInOneAction(gun);
    return {
      uid: gun,
      oneAction,
      load: (time) => firearms.loadNext(gun, time),
      rack: (time) => firearms.cock(gun, time),
      remove: (time) => firearms.removeMagazine(gun, time),
      ...(firearms.pressChecks(gun) ? { pressCheck: () => firearms.pressCheck(gun) } : {}),
      ...(oneAction || firearms.unloadsByRacking?.(gun) === false
        ? {}
        : { stillLoaded: () => firearms.stillLoaded(gun) }),
      ...(firearms.releaseLoad ? { releaseLoad: (time: number) => firearms.releaseLoad!(gun, time) } : {}),
      cancelLoad: () => firearms.cancelLoad(gun),
    };
  }
  const magazine = magazines.reloadableUid();
  return magazine === undefined
    ? undefined
    : {
        uid: magazine,
        oneAction: false,
        load: (time) => magazines.loadNext(magazine, time),
        rack: () => notHoldingGun,
        remove: () => notHoldingGun,
        cancelLoad: () => magazines.cancelLoad(magazine),
      };
};

interface Press {
  readonly binding: ReloadBinding;
  readonly at: number;
  /**
   * `second` followed a tap: it racks on an early release, or once held removes or keeps racking. `third` followed a
   * tap-tap whose rack waits on it: held, it press-checks; released early, it racks.
   */
  readonly step: 'first' | 'second' | 'third';
  released: boolean;
  /** When a released second press's rack waits on a third press: the real milliseconds it was released at. */
  rackWaitsFrom?: number;
  loading: boolean;
  /** A held second press on a gun without a detachable magazine, racking until release or nothing is left. */
  racking: boolean;
}

/** One binding can later provide different firearm actions without changing the gesture. */
export class ReloadInput {
  private press: Press | undefined;
  private down = false;

  keyDown(now: number, binding: ReloadBinding | undefined): void {
    if (this.down) {
      return;
    }
    this.down = true;
    const previous = this.press;
    const same = binding !== undefined && previous?.binding.uid === binding.uid;
    if (same && previous?.rackWaitsFrom !== undefined && now - previous.rackWaitsFrom < RELOAD_GESTURE_MS.thirdPress) {
      // Only this press's length tells a press check from the waiting rack.
      this.press = this.fresh(binding, now, 'third');
      return;
    }
    if (same && previous?.step === 'first' && previous.released && now - previous.at < RELOAD_GESTURE_MS.doublePress) {
      // Only this press's length tells a rack from a removal, so neither acts until it is released or held.
      this.press = this.fresh(binding, now, 'second');
      return;
    }
    this.advance(now, binding);
    this.down = true;
    this.press = binding ? this.fresh(binding, now, 'first') : undefined;
  }

  private fresh(binding: ReloadBinding, now: number, step: Press['step']): Press {
    return { binding, at: now, step, released: false, loading: false, racking: false };
  }

  keyUp(now: number): void {
    this.down = false;
    const { press } = this;
    if (!press) {
      return;
    }
    const early = now - press.at < RELOAD_GESTURE_MS.hold;
    if (press.step === 'third') {
      this.press = undefined;
      if (early) {
        press.binding.rack();
      }
    } else if (press.step === 'second') {
      this.releaseSecond(press, now, early);
    } else {
      this.releaseFirst(press, early);
    }
  }

  private releaseFirst(press: Press, early: boolean): void {
    if (early && !press.loading) {
      press.released = true;
    } else if (press.binding.releaseLoad) {
      press.binding.releaseLoad();
      this.press = undefined;
    } else {
      this.cancel();
    }
  }

  private releaseSecond(press: Press, now: number, early: boolean): void {
    if (press.racking) {
      this.press = undefined; // Releasing a held rack lets the cycle under way finish and starts no other.
    } else if (early && press.binding.pressCheck) {
      press.released = true;
      press.rackWaitsFrom = now;
    } else {
      this.secondPress(press, !early);
      this.press = undefined;
    }
  }

  advance(now: number, binding: ReloadBinding | undefined): void {
    const { press } = this;
    if (!press) {
      return;
    }
    if (press.binding.uid !== binding?.uid) {
      this.cancel();
      return;
    }
    const held = now - press.at >= RELOAD_GESTURE_MS.hold;
    if (press.rackWaitsFrom !== undefined) {
      if (now - press.rackWaitsFrom >= RELOAD_GESTURE_MS.thirdPress) {
        this.press = undefined; // No third press came: the tap-tap racks after all.
        press.binding.rack();
      }
    } else if (press.step === 'third') {
      if (held) {
        this.press = undefined;
        press.binding.pressCheck?.();
      }
    } else if (press.step === 'second') {
      if (press.racking) {
        this.rackAgain(press);
      } else if (held) {
        this.secondPress(press, true);
      }
    } else {
      this.advanceFirst(press, now);
    }
  }

  private advanceFirst(press: Press, now: number): void {
    if (now - press.at < Math.max(RELOAD_GESTURE_MS.hold, RELOAD_GESTURE_MS.doublePress)) {
      return;
    }
    if (press.released) {
      this.press = undefined; // A short single tap has no action.
    } else if (!press.binding.busy()) {
      press.loading = press.binding.load();
      if (!press.loading || press.binding.oneAction) {
        this.press = undefined; // Full tube/no loose shells, or the one action began: wait for a fresh press.
      }
    }
  }

  /** A released second press racks once; a held one removes the magazine, or starts racking a gun without one. */
  private secondPress(press: Press, held: boolean): void {
    if (!held) {
      press.binding.rack();
    } else if (press.binding.stillLoaded) {
      press.racking = press.binding.rack();
      this.press = press.racking ? press : undefined;
    } else {
      this.press = undefined;
      press.binding.remove();
    }
  }

  /** Each finished rack starts the next while anything is left to take out; a refused rack ends the hold. */
  private rackAgain(press: Press): void {
    if (press.binding.busy()) {
      return;
    }
    if (!(press.binding.stillLoaded?.() && press.binding.rack())) {
      this.press = undefined;
    }
  }

  cancel(): void {
    if (this.press?.loading) {
      this.press.binding.cancelLoad();
    }
    this.press = undefined;
    this.down = false;
  }
}
