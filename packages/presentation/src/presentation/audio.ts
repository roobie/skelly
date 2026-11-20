import type { Registry, SenseDef, SoundDef, SoundRecipe } from '@skelly/engine/content';
import { claimed } from '@skelly/engine/inventory';
import {
  type Audibility,
  type HeardSound,
  Hearing,
  type HeartbeatTarget,
  type HeartbeatTuning,
  heartbeatForStamina,
  playerHeartbeat,
  renderSoundRecipe,
  type SoundEmission,
  type SoundId,
  soundRecipeFor,
  soundVariantKey,
  VoiceCaps,
} from '@skelly/engine/sound';
import type { SolidAt, Vec3 } from '@skelly/engine/world';
import { bundledAssetUrl, type PackAssetFiles } from './bundledAssets.ts';

const SETTINGS_KEY = 'skelly.audio.settings';
const CATEGORIES = ['world', 'body', 'ui'] as const;
type AudioCategory = (typeof CATEGORIES)[number];

export interface AudioVolumes {
  master: number;
  world: number;
  body: number;
  ui: number;
}

const VOICE_FADE_SECONDS = 0.01;

interface Voice {
  source: AudioBufferSourceNode;
  gain: GainNode;
  stopAt?: number;
  finish: () => void;
}

/** A world sound that plays on, looping, for as long as it is listed; `key` names it stably across frames. */
export interface WorldLoop {
  readonly key: string;
  readonly event: SoundId;
  readonly positionMetres: Vec3;
}

interface SpatialRoute {
  filter: BiquadFilterNode;
  wallGain: GainNode;
  panner: PannerNode;
}

interface Loop {
  readonly event: SoundId;
  positionMetres: Vec3;
  loading: boolean;
  /** Reported once and never retried, so a missing sound cannot report on every frame. */
  unavailable: boolean;
  voice?: { route: SpatialRoute | undefined; stop: () => void };
}

const clampVolume = (value: number): number => Math.max(0, Math.min(1, value));

const readVolumes = (defaults: Readonly<AudioVolumes>): AudioVolumes => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      return { ...defaults };
    }
    const parsed = JSON.parse(raw) as Partial<AudioVolumes>;
    return {
      master: typeof parsed.master === 'number' ? clampVolume(parsed.master) : defaults.master,
      world: typeof parsed.world === 'number' ? clampVolume(parsed.world) : defaults.world,
      body: typeof parsed.body === 'number' ? clampVolume(parsed.body) : defaults.body,
      ui: typeof parsed.ui === 'number' ? clampVolume(parsed.ui) : defaults.ui,
    };
  } catch {
    return { ...defaults };
  }
};

interface Nodes {
  master: GainNode;
  categories: Map<AudioCategory, GainNode>;
}

export interface GameAudioOptions {
  registry: Registry;
  blockSize: number;
  isSolid: SolidAt;
  tuning: SenseDef;
  report: (message: string) => void;
  /** Recordings; see `PresentationAssets`, `audio`. */
  files: PackAssetFiles;
}

interface SourceStartOptions {
  context: AudioContext;
  nodes: Nodes;
  event: SoundId;
  sound: SoundDef;
  pick: { file: string; gain: number; pitch: number };
  buffer: AudioBuffer;
  positionMetres: Vec3;
  emittedAsNoise: boolean;
  sourceLabel: string | null;
  listenerRelative: boolean;
}

const connectSample = (
  context: AudioContext,
  source: AudioBufferSourceNode,
  gain: GainNode,
  sound: SoundDef,
): { nodes: AudioNode[]; carrier: OscillatorNode | null } => {
  const nodes: AudioNode[] = [source];
  let tail: AudioNode = source;
  const chain = (node: AudioNode): void => {
    tail.connect(node);
    nodes.push(node);
    tail = node;
  };
  if (sound.lowShelf) {
    const body = context.createBiquadFilter();
    body.type = 'lowshelf';
    body.frequency.value = sound.lowShelf.frequencyHz;
    body.gain.value = sound.lowShelf.gainDb;
    chain(body);
  }
  let carrier: OscillatorNode | null = null;
  if (sound.ringMod) {
    const { frequencyHz, depth } = sound.ringMod;
    const product = context.createGain();
    const swing = context.createGain();
    carrier = context.createOscillator();
    carrier.frequency.value = frequencyHz;
    product.gain.value = 1 - depth;
    swing.gain.value = depth;
    carrier.connect(swing);
    swing.connect(product.gain);
    carrier.start();
    nodes.push(carrier, swing);
    chain(product);
  }
  chain(gain);
  return { nodes, carrier };
};

/** Where a voice's source is and how the listener hears it from there. */
interface HeardAt {
  readonly audibility: Audibility;
  readonly positionMetres: Vec3;
}

/** Moves a spatial route to where and how the listener hears its source now. */
const aimRoute = ({ filter, wallGain, panner }: SpatialRoute, { audibility, positionMetres }: HeardAt): void => {
  filter.frequency.value = audibility.cutoffHz;
  wallGain.gain.value = audibility.gain;
  if (panner.positionX) {
    panner.positionX.value = positionMetres[0];
    panner.positionY.value = positionMetres[1];
    panner.positionZ.value = positionMetres[2];
  } else {
    panner.setPosition(positionMetres[0], positionMetres[1], positionMetres[2]);
  }
};

/** Sends a voice to its category: straight at the head, or through the wall filter and an HRTF panner. */
const routeVoice = (
  context: AudioContext,
  gain: GainNode,
  category: GainNode,
  heard: HeardAt,
): SpatialRoute | undefined => {
  if (heard.audibility.headLocked) {
    gain.connect(category);
    return undefined;
  }
  const filter = context.createBiquadFilter();
  const wallGain = context.createGain();
  filter.type = 'lowpass';
  const panner = context.createPanner();
  panner.panningModel = 'HRTF';
  panner.distanceModel = 'inverse';
  panner.refDistance = 1;
  panner.maxDistance = 64;
  panner.rolloffFactor = 1;
  const route = { filter, wallGain, panner };
  aimRoute(route, heard);
  gain.connect(filter);
  filter.connect(wallGain);
  wallGain.connect(panner);
  panner.connect(category);
  return route;
};

/** Thin Web Audio adapter; sound choices live in pure core modules and what is heard in `hearing.ts`. */
export class GameAudio {
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly loading = new Map<string, Promise<AudioBuffer | null>>();
  private readonly volumes: AudioVolumes;
  private context: AudioContext | undefined;
  private nodes: Nodes | undefined;
  private listenerForward: Vec3 = [0, 0, -1];
  private readonly registry: Registry;
  private readonly hearing: Hearing;
  private readonly report: (message: string) => void;
  private readonly files: PackAssetFiles;
  private readonly voiceCaps = new VoiceCaps<Voice>(VOICE_FADE_SECONDS);
  private readonly loops = new Map<string, Loop>();
  private readonly heartbeat: HeartbeatTuning;
  private heartbeatTarget: HeartbeatTarget;
  private heartbeatNextAt = Number.NEGATIVE_INFINITY;
  private heartbeatLoading = false;
  private heartbeatUnavailable = false;
  private disposed = false;
  private outputMuted = false;
  private readonly sourceObservers: ((event: SoundId, source: AudioBufferSourceNode) => void)[] = [];

  constructor({ registry, blockSize, isSolid, tuning, report, files }: GameAudioOptions) {
    this.registry = registry;
    this.files = files;
    this.hearing = new Hearing({ blockSize, isSolid, tuning });
    this.report = report;
    this.volumes = readVolumes(claimed(registry.ui, 'interface')!.audioVolumes);
    this.heartbeat = playerHeartbeat(registry);
    this.heartbeatTarget = heartbeatForStamina(this.heartbeat, 100);
  }

  dispose(): void {
    this.disposed = true;
    this.updateLoops([]);
  }

  get settings(): AudioVolumes {
    return { ...this.volumes };
  }

  get isOutputMuted(): boolean {
    return this.outputMuted;
  }

  get heardSounds(): readonly HeardSound[] {
    return this.hearing.heardSounds;
  }

  /** The audio context's state, undefined before the first unlock, for browser stages that report it. */
  get contextState(): AudioContextState | undefined {
    return this.context?.state;
  }

  /** Hands each new voice's source to `observer` before it is wired or started, for browser stages that trace voices. */
  observeSourceStarts(observer: (event: SoundId, source: AudioBufferSourceNode) => void): void {
    this.sourceObservers.push(observer);
  }

  /** Deferred entry may need a fresh gesture; play retries unlocking on its first pointerdown. */
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
      this.updateListener(this.hearing.listener, this.listenerForward);
    }
    if (this.context.state !== 'running') {
      this.context.resume().catch((error: unknown) => this.report(`audio context did not resume: ${String(error)}`));
    }
  }

  setOutputMuted(muted: boolean): void {
    if (this.outputMuted === muted) {
      return;
    }
    this.outputMuted = muted;
    this.applyVolumes();
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
    this.hearing.moveListener(positionMetres);
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

  /** Playback only. The session has already selected/committed this event and its hearing stimulus. */
  play(emission: Readonly<SoundEmission>, positionMetres: Vec3): void {
    const { event, pick, emittedAsNoise, sourceLabel, listenerRelative } = emission;
    const sound = this.registry.sounds.get(event);
    if (!sound) {
      return;
    }
    const variant = this.variantSource(event, sound, pick.file);
    if (!variant) {
      this.report(`sound file "${pick.file}" is not bundled for "${event}"`);
      return;
    }
    const { context, nodes } = this;
    if (context && nodes && context.state === 'running') {
      void this.variantBuffer(context, pick.file, variant).then((buffer) => {
        if (!buffer || this.context !== context || context.state !== 'running') {
          return;
        }
        this.startSource({
          context,
          nodes,
          event,
          sound,
          pick,
          buffer,
          positionMetres,
          emittedAsNoise,
          sourceLabel,
          listenerRelative,
        });
      });
    }
  }

  /**
   * Plays each listed world loop until it leaves the list. A loop waits for a running context, and its wall filter
   * follows the listener, so it is called after `updateListener` on each frame.
   */
  updateLoops(loops: readonly WorldLoop[]): void {
    const listed = new Set(loops.map(({ key }) => key));
    for (const [key, loop] of this.loops) {
      if (this.disposed || !listed.has(key)) {
        loop.voice?.stop();
        this.loops.delete(key);
      }
    }
    if (this.disposed) {
      return;
    }
    for (const { key, event, positionMetres } of loops) {
      let loop = this.loops.get(key);
      if (!loop) {
        loop = { event, positionMetres, loading: false, unavailable: false };
        this.loops.set(key, loop);
      }
      loop.positionMetres = positionMetres;
      const route = loop.voice?.route;
      if (route) {
        const sound = this.registry.sounds.get(loop.event)!;
        aimRoute(route, { audibility: this.hearing.audibility(sound, positionMetres, false), positionMetres });
      } else if (!loop.voice) {
        this.startLoop(key, loop);
      }
    }
  }

  private startLoop(key: string, loop: Loop): void {
    const { context, nodes } = this;
    const sound = this.registry.sounds.get(loop.event);
    if (loop.loading || loop.unavailable || !(sound && context && nodes) || context.state !== 'running') {
      return;
    }
    // A loop has no picker, so it plays its sound's first variant at the base gain.
    const file = soundVariantKey(sound.id, sound.variants[0]!);
    const variant = this.variantSource(loop.event, sound, file);
    if (!variant) {
      loop.unavailable = true;
      this.report(`sound file "${file}" is not bundled for "${loop.event}"`);
      return;
    }
    loop.loading = true;
    void this.variantBuffer(context, file, variant).then((buffer) => {
      loop.loading = false;
      loop.unavailable = buffer === null;
      if (buffer && this.loops.get(key) === loop && this.context === context && context.state === 'running') {
        loop.voice = this.startLoopVoice({ context, nodes, loop, sound, file, buffer });
      }
    });
  }

  private startLoopVoice({
    context,
    nodes,
    loop,
    sound,
    file,
    buffer,
  }: {
    context: AudioContext;
    nodes: Nodes;
    loop: Loop;
    sound: SoundDef;
    file: string;
    buffer: AudioBuffer;
  }): NonNullable<Loop['voice']> {
    const { event, positionMetres } = loop;
    const source = context.createBufferSource();
    for (const observer of this.sourceObservers) {
      observer(event, source);
    }
    const gain = context.createGain();
    source.buffer = buffer;
    source.loop = true;
    gain.gain.value = sound.gain;
    const { nodes: connectedNodes, carrier } = connectSample(context, source, gain, sound);
    const audibility = this.hearing.audibility(sound, positionMetres, false);
    const route = routeVoice(context, gain, nodes.categories.get(sound.category)!, { audibility, positionMetres });
    if (route) {
      connectedNodes.push(route.filter, route.wallGain, route.panner);
    }
    source.start();
    this.hearing.heard({
      event,
      sound,
      file,
      pickGain: sound.gain,
      audibility,
      masterVolume: this.volumes.master,
      categoryVolume: this.volumes[sound.category],
      emittedAsNoise: false,
      sourceLabel: null,
    });
    return {
      route,
      stop: () => {
        source.stop();
        carrier?.stop();
        for (const node of connectedNodes) {
          node.disconnect();
        }
      },
    };
  }

  /** Plays one exact variant, keyed by `soundVariantKey`, at the event's base gain, with no picker jitter or cooldown. */
  preview(event: SoundId, file: string): boolean {
    const sound = this.registry.sounds.get(event);
    if (!sound?.variants.some((listed) => soundVariantKey(sound.id, listed) === file)) {
      return false;
    }
    const variant = this.variantSource(event, sound, file);
    const { context, nodes } = this;
    if (!(variant && context && nodes)) {
      this.report(`sound file "${file}" is not bundled for "${event}"`);
      return false;
    }
    const pick = { file, gain: sound.gain, pitch: 1 };
    const positionMetres = this.hearing.listener;
    void this.variantBuffer(context, file, variant).then(async (buffer) => {
      if (!buffer || this.context !== context) {
        return;
      }
      if (context.state !== 'running') {
        try {
          await context.resume();
        } catch (error) {
          this.report(`audio context did not resume: ${String(error)}`);
        }
      }
      if (context.state === 'running') {
        this.startSource({
          context,
          nodes,
          event,
          sound,
          pick,
          buffer,
          positionMetres,
          emittedAsNoise: false,
          sourceLabel: null,
          listenerRelative: true,
        });
      }
    });
    return true;
  }

  /** Plays one heartbeat sound through the same category and buffer path as live beats. */
  previewHeartbeat(event: SoundId, gainValue: number): boolean {
    if (!Object.values(this.heartbeat.sounds).includes(event)) {
      return false;
    }
    const { context, nodes } = this;
    if (!(context && nodes)) {
      return false;
    }
    void this.heartbeatBuffer(context, event).then(async (buffer) => {
      if (!buffer || this.context !== context) {
        return;
      }
      if (context.state !== 'running') {
        try {
          await context.resume();
        } catch (error) {
          this.report(`audio context did not resume: ${String(error)}`);
        }
      }
      if (context.state === 'running') {
        this.startHeartbeat({ context, nodes, event, buffer, gainValue, when: context.currentTime + 0.025 });
      }
    });
    return true;
  }

  /** Playback voice allocation happens after decoding; pending loads consume no playback slots. */
  private stealOldestVoice(event: SoundId, cap: number | undefined, context: AudioContext): void {
    this.voiceCaps.makeRoom(event, cap, context.currentTime, {
      finish: (voice) => voice.finish(),
      cut: (voice) => voice.source.stop(),
      fade: (voice, now, stopAt) => {
        voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
        voice.gain.gain.linearRampToValueAtTime(0, stopAt);
        voice.source.stop(stopAt);
      },
    });
  }

  private applyVolumes(): void {
    if (!this.nodes) {
      return;
    }
    this.nodes.master.gain.value = this.outputMuted ? 0 : this.volumes.master;
    for (const category of CATEGORIES) {
      this.nodes.categories.get(category)!.gain.value = this.volumes[category];
    }
  }

  updateHeartbeat(stamina: number): void {
    if (this.disposed) {
      return;
    }
    this.heartbeatTarget = heartbeatForStamina(this.heartbeat, stamina);
    const { context, nodes } = this;
    if (
      this.heartbeatTarget.gain === 0 ||
      this.heartbeatUnavailable ||
      this.heartbeatLoading ||
      !context ||
      !nodes ||
      context.state !== 'running' ||
      context.currentTime < this.heartbeatNextAt
    ) {
      return;
    }
    this.heartbeatLoading = true;
    const { slow: slowEvent, fast: fastEvent } = this.heartbeat.sounds;
    void Promise.all([this.heartbeatBuffer(context, slowEvent), this.heartbeatBuffer(context, fastEvent)]).then(
      ([slow, fast]) => {
        this.heartbeatLoading = false;
        if (!(slow && fast)) {
          this.heartbeatUnavailable = true;
          return;
        }
        if (this.disposed || this.context !== context || context.state !== 'running') {
          return;
        }
        const target = this.heartbeatTarget;
        if (target.gain === 0) {
          return;
        }
        const interval = 60 / target.bpm;
        const when = context.currentTime + 0.025;
        // Use the recording that fits one scheduled beat; the law controls tempo, not pitch.
        const slowFits = slow.duration <= interval;
        this.startHeartbeat({
          context,
          nodes,
          event: slowFits ? slowEvent : fastEvent,
          buffer: slowFits ? slow : fast,
          gainValue: target.gain,
          when,
        });
        this.heartbeatNextAt = when + interval;
      },
    );
  }

  /** A heartbeat sound's single variant, which content validation guarantees. */
  private heartbeatBuffer(context: AudioContext, event: SoundId): Promise<AudioBuffer | null> {
    const sound = this.registry.sounds.get(event)!;
    const file = soundVariantKey(sound.id, sound.variants[0]!);
    const variant = this.variantSource(event, sound, file);
    if (!variant) {
      this.report(`heartbeat sound file "${file}" is not bundled for "${event}"`);
      return Promise.resolve(null);
    }
    return this.variantBuffer(context, file, variant);
  }

  private startHeartbeat({
    context,
    nodes,
    event,
    buffer,
    gainValue,
    when,
  }: {
    context: AudioContext;
    nodes: Nodes;
    event: SoundId;
    buffer: AudioBuffer;
    gainValue: number;
    when: number;
  }): void {
    if (gainValue === 0) {
      return;
    }
    const sound = this.registry.sounds.get(event)!;
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    source.playbackRate.value = 1;
    gain.gain.value = gainValue * sound.gain;
    source.connect(gain);
    gain.connect(nodes.categories.get(sound.category)!);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
    };
    source.start(when);
  }

  /** A variant's recipe, or its bundled file's URL; undefined when the pack lacks the file. */
  private variantSource(event: SoundId, sound: SoundDef, file: string): SoundRecipe | string | undefined {
    const recipe = soundRecipeFor(sound, file);
    if (recipe) {
      return recipe;
    }
    const origin = this.registry.soundOrigins.get(event);
    return bundledAssetUrl(this.files, origin?.source, file);
  }

  private variantBuffer(
    context: AudioContext,
    file: string,
    variant: SoundRecipe | string,
  ): Promise<AudioBuffer | null> {
    if (typeof variant === 'string') {
      return this.loadBuffer(context, file, variant);
    }
    let buffer = this.buffers.get(file);
    if (!buffer) {
      try {
        const { samples, sampleRate } = renderSoundRecipe(variant);
        buffer = context.createBuffer(1, samples.length, sampleRate);
        buffer.copyToChannel(samples, 0);
      } catch (error) {
        this.report(`sound recipe "${file}" did not render: ${String(error)}`);
        return Promise.resolve(null);
      }
      this.buffers.set(file, buffer);
    }
    return Promise.resolve(buffer);
  }

  private loadBuffer(context: AudioContext, file: string, url: string): Promise<AudioBuffer | null> {
    const cached = this.buffers.get(file);
    if (cached) {
      return Promise.resolve(cached);
    }
    const existing = this.loading.get(file);
    if (existing !== undefined) {
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

  private startSource({
    context,
    nodes,
    event,
    sound,
    pick,
    buffer,
    positionMetres,
    emittedAsNoise,
    sourceLabel,
    listenerRelative,
  }: SourceStartOptions): void {
    this.stealOldestVoice(event, sound.voiceCap, context);
    const source = context.createBufferSource();
    for (const observer of this.sourceObservers) {
      observer(event, source);
    }
    const gain = context.createGain();
    source.buffer = buffer;
    source.playbackRate.value = pick.pitch;
    gain.gain.value = pick.gain;
    const { nodes: connectedNodes, carrier } = connectSample(context, source, gain, sound);

    const category = nodes.categories.get(sound.category)!;
    const audibility = this.hearing.audibility(sound, positionMetres, listenerRelative);
    const route = routeVoice(context, gain, category, { audibility, positionMetres });
    if (route) {
      connectedNodes.push(route.filter, route.wallGain, route.panner);
    }
    let finished = false;
    const voice: Voice = {
      source,
      gain,
      finish: () => {
        if (finished) {
          return;
        }
        finished = true;
        this.voiceCaps.release(event, voice);
        carrier?.stop();
        for (const node of connectedNodes) {
          node.disconnect();
        }
      },
    };
    this.voiceCaps.add(event, sound.voiceCap, voice);
    source.onended = voice.finish;
    source.start();
    this.hearing.heard({
      event,
      sound,
      file: pick.file,
      pickGain: pick.gain,
      audibility,
      masterVolume: this.volumes.master,
      categoryVolume: this.volumes[sound.category],
      emittedAsNoise,
      sourceLabel,
    });
  }
}
