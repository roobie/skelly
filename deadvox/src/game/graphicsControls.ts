import {
  type GraphicsKey,
  type GraphicsOptions,
  type GraphicsSettings,
  type GraphicsValues,
  readGraphicsParams,
  resolveGraphics,
  setGraphicsSetting,
} from '../core/graphics.ts';
import { readGraphicsSettings, writeGraphicsSettings } from './graphicsSettings.ts';

interface GraphicsTargets {
  mood?: {
    setRenderScale: (value: number, explicit: boolean) => void;
    setBloomScale: (value: number) => void;
    setDrugVignetteScale: (value: number) => void;
  };
  shadows?: { setSmallSunMap: (value: boolean) => void };
  meshes: {
    setFastCamo: (value: boolean) => void;
    setCoarseWeathering: (value: boolean) => void;
    setCachedSurfaceNoise: (value: boolean) => void;
  };
}

export class GraphicsControls {
  private settings: GraphicsSettings;
  private readonly source: 'player' | 'mod';
  readonly overrides: Readonly<GraphicsSettings>;
  readonly tuning: GraphicsOptions;
  private readonly targets: GraphicsTargets;
  private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | undefined;

  constructor(
    tuning: GraphicsOptions,
    targets: GraphicsTargets,
    options: {
      source?: 'player' | 'mod';
      debug: boolean;
      params: URLSearchParams;
      storage?: Pick<Storage, 'getItem' | 'setItem'>;
    },
  ) {
    const { source = 'player', debug, params, storage } = options;
    this.tuning = tuning;
    this.source = source;
    this.targets = targets;
    this.storage = storage;
    this.settings = source === 'player' ? readGraphicsSettings(tuning, storage) : {};
    this.overrides = Object.freeze(source === 'player' && debug ? readGraphicsParams(params, tuning) : {});
    this.apply();
  }

  get player(): GraphicsSettings {
    return { ...this.settings };
  }

  get values(): GraphicsValues {
    return resolveGraphics(this.tuning, this.settings, this.overrides);
  }

  set<K extends GraphicsKey>(key: K, value: GraphicsValues[K]): void {
    this.settings = setGraphicsSetting(this.tuning, this.settings, key, value);
    this.changed();
  }

  clear(key: GraphicsKey): void {
    const next = { ...this.settings };
    delete next[key];
    this.settings = next;
    this.changed();
  }

  private changed(): void {
    writeGraphicsSettings(this.tuning, this.settings, this.storage);
    this.apply();
  }

  private apply(): void {
    const { values } = this;
    this.targets.mood?.setRenderScale(
      values.renderScale,
      this.source === 'mod' || this.overrides.renderScale !== undefined || this.settings.renderScale !== undefined,
    );
    this.targets.mood?.setBloomScale(values.bloomScale);
    this.targets.mood?.setDrugVignetteScale(values.drugVignette);
    this.targets.shadows?.setSmallSunMap(values.smallSunMap);
    this.targets.meshes.setFastCamo(values.fastCamo);
    this.targets.meshes.setCoarseWeathering(values.coarseWeathering);
    this.targets.meshes.setCachedSurfaceNoise(values.cachedSurfaceNoise);
  }
}
