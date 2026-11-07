import type { Registry } from '../core/content.ts';
import type { Item } from '../core/items.ts';
import { mountedOptic, type OpticZoomFrame, opticViewSettings } from '../core/opticView.ts';

interface ActiveZoom {
  frame: OpticZoomFrame;
  min: number;
  max: number;
  step: number;
  remember: boolean;
}

export class OpticZoom {
  private readonly registry: Pick<Registry, 'items' | 'models'>;
  private readonly remembered = new Map<number, OpticZoomFrame>();
  private active: ActiveZoom | undefined;

  constructor(registry: Pick<Registry, 'items' | 'models'>) {
    this.registry = registry;
  }

  frame(firearm: Item | undefined, aimingDownSights: boolean): OpticZoomFrame | undefined {
    const optic = firearm && aimingDownSights ? mountedOptic(this.registry, firearm) : undefined;
    const range = optic?.model.gun?.attachment?.properties.magnification;
    const tuning = optic?.item.opticZoom;
    const view = optic && opticViewSettings(optic.item, optic.model);
    if (!(firearm && optic && range && range.min < range.max && tuning && view)) {
      this.active = undefined;
      return undefined;
    }
    if (this.active?.frame.uid !== firearm.uid || this.active.frame.opticUid !== optic.uid) {
      const remembered = tuning.rememberPerWeapon ? this.remembered.get(firearm.uid) : undefined;
      const magnification = remembered?.opticUid === optic.uid ? remembered.magnification : view.magnification;
      this.active = {
        frame: {
          uid: firearm.uid,
          opticUid: optic.uid,
          magnification: Math.max(range.min, Math.min(range.max, magnification)),
        },
        min: range.min,
        max: range.max,
        step: tuning.step,
        remember: tuning.rememberPerWeapon,
      };
    }
    return this.active.frame;
  }

  appliedPower(firearm: Item | undefined, aimingDownSights: boolean): number {
    const variable = this.frame(firearm, aimingDownSights);
    if (variable) {
      return variable.magnification;
    }
    const optic = firearm && aimingDownSights ? mountedOptic(this.registry, firearm) : undefined;
    return optic ? (opticViewSettings(optic.item, optic.model)?.magnification ?? 1) : 1;
  }

  wheel(firearm: Item | undefined, aimingDownSights: boolean, deltaY: number): boolean {
    if (!Number.isFinite(deltaY) || deltaY === 0 || !this.frame(firearm, aimingDownSights) || !this.active) {
      return false;
    }
    const zoom = this.active;
    zoom.frame = {
      ...zoom.frame,
      magnification: Math.max(zoom.min, Math.min(zoom.max, zoom.frame.magnification - Math.sign(deltaY) * zoom.step)),
    };
    if (zoom.remember) {
      this.remembered.set(zoom.frame.uid, zoom.frame);
    }
    return true;
  }
}
