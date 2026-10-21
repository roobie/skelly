export function distribution(values) {
  if (values.length === 0 || values.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error('Expected nonempty finite nonnegative samples');
  }
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (p) => sorted[Math.ceil(sorted.length * p) - 1];
  return {
    count: values.length,
    mean: values.reduce((sum, value) => sum + value, 0) / values.length,
    p50: percentile(0.5),
    p95: percentile(0.95),
    p99: percentile(0.99),
  };
}

export function summarize(records, mode) {
  if (records.length < 2) {
    throw new Error('Need at least two warm frames');
  }
  const queriesOff = mode === 'cpu' || mode === 'off';
  const gpu = records.map((record) => {
    if (record.disjoint || (!queriesOff && record.segments.length === 0)) {
      throw new Error('Invalid GPU frame');
    }
    const values = {};
    for (const segment of record.segments) {
      if (!Number.isFinite(segment.ms) || segment.ms < 0) {
        throw new Error('Unresolved GPU query');
      }
      values[segment.label] = (values[segment.label] ?? 0) + segment.ms;
    }
    return values;
  });
  const intervals = records.slice(1).map((record, index) => record.now - records[index].now);
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

const profileCategories = [
  ['gc', /garbage collector/i],
  ['idle', /\(idle\)/],
  ['unattributed', /\(program\)/],
  ['ai', /tickActive|tickBackground|stepZombieBody|finishZombieTick/i],
  [
    'streamingMeshing',
    /meshChunk|meshColumn|buildMesh|prepareStreaming|pumpStreaming|ColumnStreamer|generateColumn|pumpMeshing|dispatchMesh/i,
  ],
];
function categoryFor(id, nodes, parents) {
  const stack = [];
  for (let at = id; at !== undefined; at = parents.get(at)) {
    stack.push(nodes.get(at).callFrame.functionName);
  }
  const names = stack.join(' ');
  return profileCategories.find(([, pattern]) => pattern.test(names))?.[0] ?? 'other';
}

export function rankProfile(profile) {
  const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
  const parents = new Map(profile.nodes.flatMap((node) => (node.children ?? []).map((id) => [id, node.id])));
  const self = new Map();
  const categories = { ai: 0, streamingMeshing: 0, gc: 0, other: 0, idle: 0, unattributed: 0 };
  let totalUs = 0;
  for (const [index, id] of (profile.samples ?? []).entries()) {
    const us = profile.timeDeltas[index];
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
      .map(([id, us]) => ({ ...nodes.get(id).callFrame, ms: us / 1000, share: us / totalUs }))
      .sort((a, b) => b.ms - a.ms),
  };
}
