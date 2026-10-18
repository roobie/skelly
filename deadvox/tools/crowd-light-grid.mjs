export function createLightGrid(capacity, bounds, radius, cellSize = 4) {
  const minX = Math.floor((bounds.minX - radius) / cellSize) * cellSize;
  const minZ = Math.floor((bounds.minZ - radius) / cellSize) * cellSize;
  const width = Math.ceil((bounds.maxX + radius - minX) / cellSize) + 1;
  const height = Math.ceil((bounds.maxZ + radius - minZ) / cellSize) + 1;
  const cells = width * height;
  const maxReferences = capacity * (Math.ceil((2 * radius) / cellSize) + 2) ** 2;
  const textureWidth = 256;
  const textureHeight = Math.ceil((cells * 4 + maxReferences) / (textureWidth * 4));
  return {
    capacity,
    radius,
    cellSize,
    minX,
    minZ,
    width,
    height,
    textureWidth,
    textureHeight,
    data: new Float32Array(textureWidth * textureHeight * 4),
    counts: new Uint32Array(cells),
    cursors: new Uint32Array(cells),
    ranges: new Int32Array(capacity * 4),
    references: 0,
    maxOccupancy: 0,
  };
}

function visitRange(grid, range, callback) {
  const [minX, maxX, minZ, maxZ] = range;
  for (let z = minZ; z <= maxZ; z++) {
    for (let x = minX; x <= maxX; x++) {
      callback(z * grid.width + x);
    }
  }
}

export function packLightGrid(grid, lights, count) {
  if (count > grid.capacity) {
    throw new Error('Light grid capacity exceeded');
  }
  grid.counts.fill(0);
  const { radius, cellSize } = grid;
  for (let i = 0; i < count; i++) {
    const x = lights[i * 4];
    const z = lights[i * 4 + 2];
    if (
      x - radius < grid.minX ||
      x + radius >= grid.minX + grid.width * cellSize ||
      z - radius < grid.minZ ||
      z + radius >= grid.minZ + grid.height * cellSize
    ) {
      throw new Error('Light grid does not encompass the emitter influence');
    }
    const range = grid.ranges.subarray(i * 4, i * 4 + 4);
    range[0] = Math.max(0, Math.floor((x - radius - grid.minX) / cellSize));
    range[1] = Math.min(grid.width - 1, Math.floor((x + radius - grid.minX) / cellSize));
    range[2] = Math.max(0, Math.floor((z - radius - grid.minZ) / cellSize));
    range[3] = Math.min(grid.height - 1, Math.floor((z + radius - grid.minZ) / cellSize));
    visitRange(grid, range, (cell) => {
      grid.counts[cell] += 1;
    });
  }
  let offset = grid.counts.length * 4;
  grid.maxOccupancy = 0;
  for (let cell = 0; cell < grid.counts.length; cell++) {
    const length = grid.counts[cell];
    grid.data[cell * 4] = offset;
    grid.data[cell * 4 + 1] = length;
    grid.cursors[cell] = offset;
    grid.maxOccupancy = Math.max(grid.maxOccupancy, length);
    offset += length;
  }
  if (offset > grid.data.length) {
    throw new Error('Light grid reference storage overflow');
  }
  for (let i = 0; i < count; i++) {
    visitRange(grid, grid.ranges.subarray(i * 4, i * 4 + 4), (cell) => {
      grid.data[grid.cursors[cell]] = i;
      grid.cursors[cell] += 1;
    });
  }
  grid.references = offset - grid.counts.length * 4;
}
