import type { Registry, SoundDef } from '../core/content.ts';
import type { Vec3 } from '../core/coords.ts';
import type { SolidAt } from '../core/raycast.ts';
import type { SoundEventId } from '../core/soundEvents.ts';
import { soundOcclusion } from '../core/soundOcclusion.ts';
import { SoundPicker } from '../core/soundPicker.ts';

const SETTINGS_KEY = 'deadvox.audio.settings';
const CATEGORIES = ['world', 'body', 'ui'] as const;
type AudioCategory = (typeof CATEGORIES)[number];

export interface AudioVolumes {
  master: number;
  world: number;
  body: number;
  ui: number;
}

const DEFAULT_VOLUMES: AudioVolumes = { master: 0.8, world: 0.8, body: 0.8, ui: 0.8 };
const clampVolume = (value: number): number => Math.max(0, Math.min(1, value));

const readVolumes = (): AudioVolumes => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      return { ...DEFAULT_VOLUMES };
    }
    const parsed = JSON.parse(raw) as Partial<AudioVolumes>;
    return {
      master: typeof parsed.master === 'number' ? clampVolume(parsed.master) : DEFAULT_VOLUMES.master,
      world: typeof parsed.world === 'number' ? clampVolume(parsed.world) : DEFAULT_VOLUMES.world,
      body: typeof parsed.body === 'number' ? clampVolume(parsed.body) : DEFAULT_VOLUMES.body,
      ui: typeof parsed.ui === 'number' ? clampVolume(parsed.ui) : DEFAULT_VOLUMES.ui,
    };
  } catch {
    return { ...DEFAULT_VOLUMES };
  }
};

const PACK_FILES: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>('../content/base/assets/audio/**/*.ogg', {
      eager: true,
      query: '?url',
      import: 'default',
    }),
  ).map(([path, url]) => [path, url]),
);

interface Nodes {
  master: GainNode;
  categories: Map<AudioCategory, GainNode>;
}

export interface GameAudioOptions {
  registry: Registry;
  seed: number;
  blockSize: number;
  isSolid: SolidAt;
  report: (message: string) => void;
}

interface SourceStartOptions {
  context: AudioContext;
  nodes: Nodes;
  sound: SoundDef;
  pick: { gain: number; pitch: number };
  buffer: AudioBuffer;
  positionMetres: Vec3;
}

/** Thin Web Audio adapter; sound choices and occlusion calculations live in pure core modules. */
export class GameAudio {
  private readonly picker: SoundPicker;
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly loading = new Map<string, Promise<AudioBuffer | null>>();
  private readonly volumes = readVolumes();
  private context: AudioContext | undefined;
  private nodes: Nodes | undefined;
  private listenerPosition: Vec3 = [0, 0, 0];
  private listenerForward: Vec3 = [0, 0, -1];
  private readonly registry: Registry;
  private readonly blockSize: number;
  private readonly isSolid: SolidAt;
  private readonly report: (message: string) => void;

  constructor({ registry, seed, blockSize, isSolid, report }: GameAudioOptions) {
    this.registry = registry;
    this.blockSize = blockSize;
    this.isSolid = isSolid;
    this.report = report;
    this.picker = new SoundPicker(seed, registry.sounds);
  }

  get settings(): AudioVolumes {
    return { ...this.volumes };
  }

  /** Must be called synchronously from a user gesture. */
  unlock(): void {
    if (!this.context) {
      this.context = new AudioContext();
      const master = this.context.createGain();
      const categories = new Map<AudioCategory, GainNode>();
      for (const category of CATEGORIES) {
        const gain = this.context.createGain();
        gain.connect(master);
        categories.set(category, gain);
      }
      master.connect(this.context.destination);
      this.nodes = { master, categories };
      this.applyVolumes();
      this.updateListener(this.listenerPosition, this.listenerForward);
    }
    if (this.context.state !== 'running') {
      this.context.resume().catch((error: unknown) => this.report(`audio context did not resume: ${String(error)}`));
    }
  }

  setVolume(category: keyof AudioVolumes, value: number): void {
    this.volumes[category] = clampVolume(value);
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.volumes));
    } catch {
      // Audio remains usable in private browsing modes that deny storage.
    }
    this.applyVolumes();
  }

  updateListener(positionMetres: Vec3, forward: Vec3): void {
    this.listenerPosition = [...positionMetres];
    this.listenerForward = [...forward];
    const listener = this.context?.listener;
    if (!listener) {
      return;
    }
    if (listener.positionX) {
      listener.positionX.value = positionMetres[0];
      listener.positionY.value = positionMetres[1];
      listener.positionZ.value = positionMetres[2];
    } else {
      listener.setPosition(positionMetres[0], positionMetres[1], positionMetres[2]);
    }
    if (listener.forwardX && listener.upX) {
      listener.forwardX.value = forward[0];
      listener.forwardY.value = forward[1];
      listener.forwardZ.value = forward[2];
      listener.upX.value = 0;
      listener.upY.value = 1;
      listener.upZ.value = 0;
    } else {
      listener.setOrientation(forward[0], forward[1], forward[2], 0, 1, 0);
    }
  }

  play(event: SoundEventId, positionMetres: Vec3, simulationTime: number): boolean {
    const sound = this.registry.sounds.get(event);
    const pick = this.picker.pick(event, simulationTime);
    if (!(sound && pick)) {
      return false;
    }
    const origin = this.registry.soundOrigins.get(event);
    const packPath = origin?.source.slice(0, origin.source.lastIndexOf('/'));
    const url = packPath ? PACK_FILES[`${packPath}/${pick.file}`] : undefined;
    if (!url) {
      this.report(`sound file "${pick.file}" is not bundled for "${event}"`);
      return false;
    }
    const { context, nodes } = this;
    if (context && nodes && context.state === 'running') {
      this.loadBuffer(context, pick.file, url).then((buffer) => {
        if (!buffer || this.context !== context || context.state !== 'running') {
          return;
        }
        this.startSource({ context, nodes, sound, pick, buffer, positionMetres });
      });
    }
    return true;
  }

  private applyVolumes(): void {
    if (!this.nodes) {
      return;
    }
    this.nodes.master.gain.value = this.volumes.master;
    for (const category of CATEGORIES) {
      this.nodes.categories.get(category)!.gain.value = this.volumes[category];
    }
  }

  private loadBuffer(context: AudioContext, file: string, url: string): Promise<AudioBuffer | null> {
    const cached = this.buffers.get(file);
    if (cached) {
      return Promise.resolve(cached);
    }
    const existing = this.loading.get(file);
    if (existing) {
      return existing;
    }
    const request = fetch(url)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.arrayBuffer();
      })
      .then((data) => context.decodeAudioData(data))
      .then((buffer) => {
        this.buffers.set(file, buffer);
        return buffer;
      })
      .catch((error: unknown) => {
        this.report(`sound file "${file}" did not load: ${String(error)}`);
        return null;
      })
      .finally(() => this.loading.delete(file));
    this.loading.set(file, request);
    return request;
  }

  private startSource({ context, nodes, sound, pick, buffer, positionMetres }: SourceStartOptions): void {
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    source.playbackRate.value = pick.pitch;
    gain.gain.value = pick.gain;
    source.connect(gain);
    const connectedNodes: AudioNode[] = [source, gain];

    const category = nodes.categories.get(sound.category)!;
    if (sound.category === 'ui') {
      gain.connect(category);
    } else {
      const filter = context.createBiquadFilter();
      const wallGain = context.createGain();
      const listenerBlocks: Vec3 = this.listenerPosition.map((v) => v / this.blockSize) as Vec3;
      const sourceBlocks: Vec3 = positionMetres.map((v) => v / this.blockSize) as Vec3;
      const occlusion = soundOcclusion(listenerBlocks, sourceBlocks, this.isSolid);
      filter.type = 'lowpass';
      filter.frequency.value = occlusion.cutoffHz;
      wallGain.gain.value = occlusion.gain;
      const panner = context.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = 1;
      panner.maxDistance = 64;
      panner.rolloffFactor = 1;
      if (panner.positionX) {
        panner.positionX.value = positionMetres[0];
        panner.positionY.value = positionMetres[1];
        panner.positionZ.value = positionMetres[2];
      } else {
        panner.setPosition(positionMetres[0], positionMetres[1], positionMetres[2]);
      }
      connectedNodes.push(filter, wallGain, panner);
      gain.connect(filter);
      filter.connect(wallGain);
      wallGain.connect(panner);
      panner.connect(category);
    }
    source.onended = () => {
      for (const node of connectedNodes) {
        node.disconnect();
      }
    };
    source.start();
  }
}
