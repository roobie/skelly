/**
 * @import { FrameRecord, GpuSegment, QueryMode } from './perf-baseline-browser.mjs'
 */

/**
 * A frame record as it comes back from the page.
 * @typedef {Pick<FrameRecord, 'now' | 'cpuMs' | 'disjoint' | 'actorDraws' | 'zombieDraws'> & {
 *   segments: readonly Pick<GpuSegment, 'label' | 'ms'>[];
 * }} FrameSample
 */
/** @typedef {'ai' | 'streamingMeshing' | 'gc' | 'other' | 'idle' | 'unattributed'} ProfileCategory */
/** @typedef {{ id: number; callFrame: { functionName: string }; children?: readonly number[] }} ProfileNode */
/**
 * The fields of a Chrome DevTools CPU profile the ranking reads.
 * @typedef {{ nodes: readonly ProfileNode[]; samples?: readonly number[]; timeDeltas?: readonly number[] }} CpuProfile
 */

/** @param {readonly number[]} values */
export function distribution(values) {
  if (values.length === 0 || values.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error('Expected nonempty finite nonnegative samples');
  }
  const sorted = [...values].sort((a, b) => a - b);
  /** @param {number} p */
  const percentile = (p) => sorted[Math.ceil(sorted.length * p) - 1] ?? Number.NaN;
  return {
    count: values.length,
    mean: values.reduce((sum, value) => sum + value, 0) / values.length,
    p50: percentile(0.5),
    p95: percentile(0.95),
    p99: percentile(0.99),
  };
}

/**
 * @param {readonly FrameSample[]} records
 * @param {QueryMode} mode
 */
export function summarize(records, mode) {
  if (records.length < 2) {
    throw new Error('Need at least two warm frames');
  }
  const queriesOff = mode === 'cpu' || mode === 'off';
  const gpu = records.map((record) => {
    if (record.disjoint || (!queriesOff && record.segments.length === 0)) {
      throw new Error('Invalid GPU frame');
    }
    /** @type {Record<string, number>} */
    const values = {};
    for (const segment of record.segments) {
      if (segment.ms === null || !Number.isFinite(segment.ms) || segment.ms < 0) {
        throw new Error('Unresolved GPU query');
      }
      values[segment.label] = (values[segment.label] ?? 0) + segment.ms;
    }
    return values;
  });
  const intervals = records.flatMap((record, index) => {
    const previous = records[index - 1];
    return previous === undefined ? [] : [record.now - previous.now];
  });
  const passNames = [...new Set(gpu.flatMap(Object.keys))];
  return {
    frames: records.length,
    mainThreadMs: distribution(records.map((record) => record.cpuMs)),
    frameIntervalMs: {
      ...distribution(intervals),
      over16Point7Share: intervals.filter((ms) => ms > 16.7).length / intervals.length,
      over18Share: intervals.filter((ms) => ms > 18).length / intervals.length,
    },
    wholeFrameGpuMs: queriesOff
      ? null
      : distribution(gpu.map((frame) => Object.values(frame).reduce((a, b) => a + b, 0))),
    passes: Object.fromEntries(passNames.map((name) => [name, distribution(gpu.map((frame) => frame[name] ?? 0))])),
    actorDrawFrames: records.filter((record) => record.actorDraws > 0).length,
    zombieDrawFrames: records.filter((record) => record.zombieDraws > 0).length,
  };
}

/** @type {readonly [ProfileCategory, RegExp][]} */
const profileCategories = [
  ['gc', /garbage collector/i],
  ['idle', /\(idle\)/],
  ['unattributed', /\(program\)/],
  ['ai', /tickActive|tickBackground|stepActorBody|finishActorTick/i],
  [
    'streamingMeshing',
    /meshChunk|meshColumn|buildMesh|prepareStreaming|pumpStreaming|ColumnStreamer|generateColumn|pumpMeshing|dispatchMesh/i,
  ],
];

/**
 * @param {ReadonlyMap<number, ProfileNode>} nodes
 * @param {number} id
 */
function nodeOf(nodes, id) {
  const node = nodes.get(id);
  if (!node) {
    throw new Error(`CPU profile has no node ${id}`);
  }
  return node;
}

/**
 * @param {number} id
 * @param {ReadonlyMap<number, ProfileNode>} nodes
 * @param {ReadonlyMap<number, number>} parents
 * @returns {ProfileCategory}
 */
function categoryFor(id, nodes, parents) {
  const stack = [];
  /** @type {number | undefined} */
  let at = id;
  while (at !== undefined) {
    stack.push(nodeOf(nodes, at).callFrame.functionName);
    at = parents.get(at);
  }
  const names = stack.join(' ');
  return profileCategories.find(([, pattern]) => pattern.test(names))?.[0] ?? 'other';
}

/** @param {CpuProfile} profile */
export function rankProfile(profile) {
  const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
  const parents = new Map(
    profile.nodes.flatMap((node) => (node.children ?? []).map((id) => /** @type {const} */ ([id, node.id]))),
  );
  /** @type {Map<number, number>} */
  const self = new Map();
  /** @type {Record<ProfileCategory, number>} */
  const categories = { ai: 0, streamingMeshing: 0, gc: 0, other: 0, idle: 0, unattributed: 0 };
  let totalUs = 0;
  for (const [index, id] of (profile.samples ?? []).entries()) {
    const us = profile.timeDeltas?.[index];
    if (us === undefined) {
      throw new Error('CPU profile sample has no time delta');
    }
    totalUs += us;
    self.set(id, (self.get(id) ?? 0) + us);
    categories[categoryFor(id, nodes, parents)] += us;
  }
  if (!totalUs) {
    throw new Error('Empty CPU profile');
  }
  return {
    sampledMs: totalUs / 1000,
    categories: Object.entries(categories)
      .map(([name, us]) => ({ name, ms: us / 1000, share: us / totalUs }))
      .sort((a, b) => b.ms - a.ms),
    self: [...self]
      .map(([id, us]) => ({ ...nodeOf(nodes, id).callFrame, ms: us / 1000, share: us / totalUs }))
      .sort((a, b) => b.ms - a.ms),
  };
}
