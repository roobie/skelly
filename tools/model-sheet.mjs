// Spike: renders exported GLB models headlessly to PNG tiles and a contact sheet, with no browser or GPU,
// so an authoring agent can look at what it drew and a reviewer can scan a whole batch at once.
import { mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { crc32, deflateSync } from 'node:zlib';

const DEFAULT_MODELS = 'packages/deadvox/src/content/base/assets/models';
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: 'string', default: 'model-sheet' },
    models: { type: 'string', default: DEFAULT_MODELS },
    size: { type: 'string', default: '256' },
  },
});
const VIEW = Number(values.size);
const SS = 2;

// ---------- GLB ----------
function parseGlb(buf) {
  if (buf.readUInt32LE(0) !== 0x46_54_6c_67) {
    throw new Error('not a GLB');
  }
  let offset = 12;
  let json;
  let bin;
  while (offset < buf.length) {
    const length = buf.readUInt32LE(offset);
    const type = buf.readUInt32LE(offset + 4);
    const chunk = buf.subarray(offset + 8, offset + 8 + length);
    if (type === 0x4e_4f_53_4a) {
      json = JSON.parse(chunk.toString('utf8'));
    } else if (type === 0x00_4e_49_42) {
      bin = chunk;
    }
    offset += 8 + length;
  }
  return { json, bin };
}

const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const READERS = {
  5120: ['getInt8', 1],
  5121: ['getUint8', 1],
  5122: ['getInt16', 2],
  5123: ['getUint16', 2],
  5125: ['getUint32', 4],
  5126: ['getFloat32', 4],
};
function readAccessor({ json, bin }, index) {
  const accessor = json.accessors[index];
  const view = json.bufferViews[accessor.bufferView];
  const n = COMPONENTS[accessor.type];
  const [getter, bytes] = READERS[accessor.componentType];
  const stride = view.byteStride ?? n * bytes;
  const base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  const out = new Float64Array(accessor.count * n);
  for (let i = 0; i < accessor.count; i++) {
    for (let c = 0; c < n; c++) {
      out[i * n + c] = dv[getter](base + i * stride + c * bytes, true);
    }
  }
  return out;
}

// ---------- maths (column-major 4x4, as glTF) ----------
const identity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function multiply(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      for (let k = 0; k < 4; k++) {
        o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
      }
    }
  }
  return o;
}
function trs(node) {
  if (node.matrix) {
    return node.matrix;
  }
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  return [
    (1 - 2 * (y * y + z * z)) * sx,
    2 * (x * y + z * w) * sx,
    2 * (x * z - y * w) * sx,
    0,
    2 * (x * y - z * w) * sy,
    (1 - 2 * (x * x + z * z)) * sy,
    2 * (y * z + x * w) * sy,
    0,
    2 * (x * z + y * w) * sz,
    2 * (y * z - x * w) * sz,
    (1 - 2 * (x * x + y * y)) * sz,
    0,
    tx,
    ty,
    tz,
    1,
  ];
}
const apply = (m, x, y, z) => [
  m[0] * x + m[4] * y + m[8] * z + m[12],
  m[1] * x + m[5] * y + m[9] * z + m[13],
  m[2] * x + m[6] * y + m[10] * z + m[14],
];
const linearToSrgb = (v) => Math.round(255 * (v <= 0.003_130_8 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055));

function primitiveTriangles(glb, primitive, world, id) {
  const pos = readAccessor(glb, primitive.attributes.POSITION);
  const idx =
    primitive.indices === undefined
      ? Array.from({ length: pos.length / 3 }, (_, i) => i)
      : readAccessor(glb, primitive.indices);
  const pbr = glb.json.materials?.[primitive.material]?.pbrMetallicRoughness ?? {};
  const factor = pbr.baseColorFactor ?? [0.8, 0.8, 0.8, 1];
  const verts = [];
  for (let i = 0; i < pos.length; i += 3) {
    verts.push(apply(world, pos[i], pos[i + 1], pos[i + 2]));
  }
  return {
    verts,
    idx,
    colour: factor.slice(0, 3).map(linearToSrgb),
    opacity: factor[3] ?? 1,
    metallic: pbr.metallicFactor ?? 1,
    roughness: pbr.roughnessFactor ?? 1,
    material: primitive.extras?.material,
    id,
  };
}

// Flattens the scene into world-space triangles with one colour per primitive. Skins draw in bind pose.
function triangles(glb) {
  const { json } = glb;
  const out = [];
  const walk = (index, parent) => {
    const node = json.nodes[index];
    const world = multiply(parent, trs(node));
    const primitives = node.mesh === undefined ? [] : json.meshes[node.mesh].primitives;
    for (const primitive of primitives.filter((p) => (p.mode ?? 4) === 4)) {
      out.push(primitiveTriangles(glb, primitive, world, out.length + 1));
    }
    for (const child of node.children ?? []) {
      walk(child, world);
    }
  };
  for (const root of json.scenes[json.scene ?? 0].nodes) {
    walk(root, identity());
  }
  return out;
}

// ---------- views ----------
// Rows of a rotation taking model space to view space (x right, y up, z towards the viewer).
// Tools lie along x, so front looks down -z, side looks down -x, top looks down -y.
const rot = (yaw, pitch) => {
  // A positive pitch raises the camera to look down.
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = -Math.sin(pitch);
  return [
    [cy, 0, -sy],
    [sy * sp, cp, cy * sp],
    [sy * cp, -sp, cy * cp],
  ];
};
const VIEWS = [
  { name: 'front', r: rot(0, 0) },
  { name: 'side', r: rot(-Math.PI / 2, 0) },
  { name: 'top', r: rot(0, Math.PI / 2) },
  { name: 'iso', r: rot(-Math.PI / 4, Math.atan(1 / Math.SQRT2)) },
];
const LIGHT = (() => {
  const l = [-0.45, 0.7, 0.55];
  const n = Math.hypot(...l);
  return l.map((v) => v / n);
})();

const project = (r, [x, y, z]) => [
  r[0][0] * x + r[0][1] * y + r[0][2] * z,
  r[1][0] * x + r[1][1] * y + r[1][2] * z,
  r[2][0] * x + r[2][1] * y + r[2][2] * z,
];
function extent(projected) {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const vs of projected) {
    for (const [x, y] of vs) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  return { minX, maxX, minY, maxY };
}
// Near-black finishes would shade to a silhouette, so the albedo keeps a floor; colours read slightly lighter than authored.
const lift = (c) => 28 + c * (227 / 255);

// A grid every centimetre, darker every 10 cm, so size reads off the picture.
function drawGrid(frame, ox, oy, s) {
  const { W, colour } = frame;
  for (const [step, shade] of [
    [0.01, 222],
    [0.1, 200],
  ]) {
    const px = step * s;
    if (px < 6) {
      continue;
    }
    for (let gx = ((ox % px) + px) % px; gx < W; gx += px) {
      for (let y = 0; y < W; y++) {
        colour.fill(shade, (y * W + Math.floor(gx)) * 3, (y * W + Math.floor(gx)) * 3 + 3);
      }
    }
    for (let gy = ((oy % px) + px) % px; gy < W; gy += px) {
      colour.fill(shade, Math.floor(gy) * W * 3, (Math.floor(gy) + 1) * W * 3);
    }
  }
}

// Flat normal in view space, facing the viewer; the screen flips y, so undo that for lighting.
function faceNormal(a, b, c) {
  const ux = b[0] - a[0];
  const uy = -(b[1] - a[1]);
  const uz = b[2] - a[2];
  const vx = c[0] - a[0];
  const vy = -(c[1] - a[1]);
  const vz = c[2] - a[2];
  const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
  const length = Math.hypot(...n) * Math.sign(n[2] || 1);
  return length === 0 ? undefined : n.map((v) => v / length);
}

const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
const HALF = (() => {
  const h = [LIGHT[0], LIGHT[1], LIGHT[2] + 1];
  const n = Math.hypot(...h);
  return h.map((v) => v / n);
})();

// Flat faces have no environment to reflect, so metal mirrors a sky-to-ground gradient tinted by its own
// colour and takes a tinted highlight; without that, bronze and polished steel read as painted wood.
// A flat face has one normal, so the returned sheen sweeps metal across the view to show it in head-on views too.
function surfaceColour(prim, n) {
  const diffuse = Math.max(0, dot(n, LIGHT));
  const gloss = 1 - prim.roughness;
  const highlight = Math.max(0, dot(n, HALF)) ** (4 + 80 * gloss * gloss) * gloss;
  // The reflected view direction's height: 1 mirrors the sky overhead, -1 the ground.
  const up = 2 * n[2] * n[1];
  const sky = 0.45 + 0.55 * Math.max(0, up) - 0.25 * Math.max(0, -up);
  const m = prim.metallic;
  return prim.colour.map((ch) => {
    const c = lift(ch);
    const plain = c * (0.4 + 0.6 * diffuse) + 60 * highlight;
    const metal = c * (0.2 + 0.3 * diffuse + 0.7 * sky) + c * 0.9 * highlight + 50 * highlight;
    return Math.min(255, plain * (1 - m) + metal * m);
  });
}

// Calls visit(x, y, i, z) for each pixel the triangle covers.
function rasterize(W, [a, b, c], area, visit) {
  const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])));
  const x1 = Math.min(W - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
  const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])));
  const y1 = Math.min(W - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const w0 = ((b[0] - px) * (c[1] - py) - (b[1] - py) * (c[0] - px)) / area;
      const w1 = ((c[0] - px) * (a[1] - py) - (c[1] - py) * (a[0] - px)) / area;
      const w2 = 1 - w0 - w1;
      if (Math.min(w0, w1, w2) >= -1e-6) {
        visit(x, y, y * W + x, w0 * a[2] + w1 * b[2] + w2 * c[2]);
      }
    }
  }
}

// See-through parts draw after every opaque one: each blends over what lies behind it, and the frontmost
// see-through surface keeps its own depth, part and normal buffers so its edges can be outlined.
function fillTriangle(frame, tri, prim) {
  const [a, b, c] = tri;
  const { W, colour, clear } = frame;
  const n = faceNormal(a, b, c);
  const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  if (!n || area === 0) {
    return;
  }
  const rgb = surfaceColour(prim, n);
  const mark = (buffers, i, z) => {
    buffers.depth[i] = z;
    buffers.ids[i] = prim.id;
    buffers.normals.set(n, i * 3);
  };
  if (prim.opacity < 1) {
    // Glancing faces reflect more, so a clear pane still shows where it turns.
    const alpha = prim.opacity + (1 - prim.opacity) * 0.6 * (1 - Math.abs(n[2])) ** 2;
    rasterize(W, tri, area, (_x, _y, i, z) => {
      if (z > frame.depth[i]) {
        for (let ch = 0; ch < 3; ch++) {
          colour[i * 3 + ch] = colour[i * 3 + ch] * (1 - alpha) + rgb[ch] * alpha;
        }
        if (z > clear.depth[i]) {
          mark(clear, i, z);
        }
      }
    });
    return;
  }
  rasterize(W, tri, area, (x, y, i, z) => {
    if (z > frame.depth[i]) {
      mark(frame, i, z);
      const sheen = 1 + 0.3 * prim.metallic * Math.sin((2 * Math.PI * (x + y)) / (0.5 * W));
      for (let ch = 0; ch < 3; ch++) {
        colour[i * 3 + ch] = Math.min(255, rgb[ch] * sheen);
      }
    }
  });
}

// Outlines where the part changes, the depth jumps or the surface turns, so parts, silhouettes and
// the faces of dark parts stay legible. The line contrasts with the surface it sits on.
// A depth step counts only when it beats both 4 mm and what a steep face covers across three pixels:
// a fixed step alone outlines every pixel of a sloped face once a pixel spans more than about 1 mm.
const JUMP = 0.004;
const STEEP_PIXELS = 3;
function edgeAt({ depth, ids, normals, jump }, i, j) {
  if (ids[j] === 0) {
    return 'silhouette';
  }
  const samepart = ids[j] === ids[i];
  const front = depth[i] >= depth[j];
  const facing =
    normals[i * 3] * normals[j * 3] + normals[i * 3 + 1] * normals[j * 3 + 1] + normals[i * 3 + 2] * normals[j * 3 + 2];
  const part = !samepart && front;
  const step = samepart && depth[i] - depth[j] > jump;
  const crease = samepart && front && facing < 0.9;
  return part || step || crease ? 'inner' : undefined;
}
const firstEdge = (buffers, W, i) =>
  edgeAt(buffers, i, i - 1) ?? edgeAt(buffers, i, i + 1) ?? edgeAt(buffers, i, i - W) ?? edgeAt(buffers, i, i + W);
function outlinePixel(frame, out, i) {
  const { W, colour, ids, clear } = frame;
  const edge = ids[i] ? firstEdge(frame, W, i) : undefined;
  if (edge) {
    const dark = colour[i * 3] + colour[i * 3 + 1] + colour[i * 3 + 2] < 200;
    out.fill(edge === 'silhouette' || !dark ? 30 : 110, i * 3, i * 3 + 3);
  }
  // See-through edges draw half strength, so they read as glass rather than as a solid part.
  if (clear.ids[i] && firstEdge(clear, W, i)) {
    for (let ch = 0; ch < 3; ch++) {
      out[i * 3 + ch] = (out[i * 3 + ch] + 40) / 2;
    }
  }
}
function outline(frame) {
  const { W, colour } = frame;
  const out = new Uint8Array(colour);
  for (let y = 1; y < W - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      outlinePixel(frame, out, y * W + x);
    }
  }
  return out;
}

// Box-filters the supersampled image down.
function downsample(image, W, size) {
  const final = new Uint8Array(size * size * 3);
  for (let i = 0; i < final.length; i++) {
    const ch = i % 3;
    const x = Math.floor(i / 3) % size;
    const y = Math.floor(i / 3 / size);
    let sum = 0;
    for (let d = 0; d < SS * SS; d++) {
      sum += image[((y * SS + Math.floor(d / SS)) * W + x * SS + (d % SS)) * 3 + ch];
    }
    final[i] = sum / (SS * SS);
  }
  return final;
}

function renderView(prims, r, scale, size) {
  const W = size * SS;
  const s = scale * SS;
  const buffers = () => ({
    depth: new Float32Array(W * W).fill(Number.NEGATIVE_INFINITY),
    ids: new Int32Array(W * W),
    normals: new Float32Array(W * W * 3),
    jump: Math.max(JUMP, STEEP_PIXELS / s),
  });
  const frame = { W, colour: new Uint8Array(W * W * 3).fill(232), ...buffers(), clear: buffers() };
  const projected = prims.map((p) => p.verts.map((v) => project(r, v)));
  const { minX, maxX, minY, maxY } = extent(projected);
  const ox = W / 2 - ((minX + maxX) / 2) * s;
  const oy = W / 2 + ((minY + maxY) / 2) * s;
  drawGrid(frame, ox, oy, s);
  const order = [...prims.keys()].sort((a, b) => Number(prims[a].opacity < 1) - Number(prims[b].opacity < 1));
  for (const pi of order) {
    const prim = prims[pi];
    const vs = projected[pi].map(([x, y, z]) => [ox + x * s, oy - y * s, z]);
    for (let t = 0; t < prim.idx.length; t += 3) {
      fillTriangle(frame, [vs[prim.idx[t]], vs[prim.idx[t + 1]], vs[prim.idx[t + 2]]], prim);
    }
  }
  return downsample(outline(frame), W, size);
}

// ---------- PNG ----------
function png(width, height, rgb) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    Buffer.from(rgb.buffer, rgb.byteOffset + y * width * 3, width * 3).copy(raw, y * (width * 3 + 1) + 1);
  }
  const chunk = (type, data) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, 'ascii');
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
    return Buffer.concat([head, data, tail]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- one model -> 2x2 tile ----------
function renderModel(file) {
  const glb = parseGlb(readFileSync(file));
  const prims = triangles(glb);
  if (prims.every((p) => p.idx.length === 0)) {
    throw new Error('no triangles');
  }
  const all = prims.flatMap((p) => p.verts);
  // A loop, because spreading a whole vehicle's vertices overflows the call stack.
  const min = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const max = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (const v of all) {
    for (const k of [0, 1, 2]) {
      min[k] = Math.min(min[k], v[k]);
      max[k] = Math.max(max[k], v[k]);
    }
  }
  const size = max.map((v, k) => v - min[k]);
  // One scale for all four views so their proportions compare; the widest view fills 85% of its square.
  const widest = Math.max(
    1e-6,
    ...VIEWS.map(({ r }) => {
      const e = extent(prims.map((p) => p.verts.map((v) => project(r, v))));
      return Math.max(e.maxX - e.minX, e.maxY - e.minY);
    }),
  );
  const scale = (VIEW * 0.85) / widest;
  const views = VIEWS.map(({ r }) => renderView(prims, r, scale, VIEW));
  const T = VIEW * 2;
  const tile = new Uint8Array(T * T * 3);
  views.forEach((v, n) => {
    const ox = (n % 2) * VIEW;
    const oy = Math.floor(n / 2) * VIEW;
    for (let y = 0; y < VIEW; y++) {
      tile.set(v.subarray(y * VIEW * 3, (y + 1) * VIEW * 3), ((oy + y) * T + ox) * 3);
    }
  });
  for (let k = 0; k < T; k++) {
    tile.fill(150, (VIEW * T + k) * 3, (VIEW * T + k) * 3 + 3);
    tile.fill(150, (k * T + VIEW) * 3, (k * T + VIEW) * 3 + 3);
  }
  const materials = [...new Set(prims.map((p) => p.material).filter(Boolean))];
  return {
    png: png(T, T, tile),
    meta: {
      id: basename(file, '.glb'),
      sizeCm: size.map((v) => Math.round(v * 1000) / 10),
      triangles: prims.reduce((n, p) => n + p.idx.length / 3, 0),
      parts: glb.json.nodes.filter((n) => n.mesh !== undefined).length,
      materials,
    },
  };
}

// ---------- contact sheet ----------
const modelsDir = resolve(values.models);
const outDir = resolve(values.out);
mkdirSync(join(outDir, 'tiles'), { recursive: true });
const wanted = positionals.length > 0 ? new Set(positionals) : null;
const files = readdirSync(modelsDir)
  .filter((f) => f.endsWith('.glb') && (!wanted || wanted.has(basename(f, '.glb'))))
  .sort();
const writeAtomic = (path, data) => {
  const scratch = `${path}.${process.pid}.tmp`;
  writeFileSync(scratch, data);
  renameSync(scratch, path);
};
const started = performance.now();
const rows = [];
for (const f of files) {
  try {
    const { png: image, meta } = renderModel(join(modelsDir, f));
    writeAtomic(join(outDir, 'tiles', `${meta.id}.png`), image);
    rows.push(meta);
  } catch (error) {
    rows.push({ id: basename(f, '.glb'), error: String(error) });
  }
}
for (const id of positionals) {
  if (!files.includes(`${id}.glb`)) {
    rows.push({ id, error: 'no such model' });
  }
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const html = `<!doctype html><meta charset="utf-8"><title>Model sheet</title>
<style>body{font:13px system-ui;background:#f4f4f2;margin:16px}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}
figure{margin:0;background:#fff;border:1px solid #ccc;padding:6px}img{width:100%;image-rendering:auto}figcaption b{font-family:monospace}.err{color:#b00}
input{font:inherit;padding:4px 8px;margin-bottom:12px;width:280px}</style>
<p>${rows.length} models · views: front | side / top | iso · grid 1 cm, bold 10 cm, each where its lines fit · <input id=q placeholder="filter by id"></p><main>
${rows.map((r) => (r.error ? `<figure data-id="${esc(r.id)}"><figcaption><b>${esc(r.id)}</b><div class=err>${esc(r.error)}</div></figcaption></figure>` : `<figure data-id="${esc(r.id)}"><img loading=lazy src="tiles/${esc(r.id)}.png" alt="${esc(r.id)}"><figcaption><b>${esc(r.id)}</b><br>${r.sizeCm.join(' × ')} cm · ${r.triangles} tris · ${esc(r.materials.join(', '))}</figcaption></figure>`)).join('\n')}
</main><script>q.oninput=()=>{for(const f of document.querySelectorAll('figure'))f.hidden=!f.dataset.id.includes(q.value)}</script>`;
writeFileSync(join(outDir, 'index.html'), html);
writeAtomic(join(outDir, 'sheet.json'), `${JSON.stringify(rows, null, 1)}\n`);
const failed = rows.filter((r) => r.error);
console.log(
  `${rows.length - failed.length}/${rows.length} rendered in ${((performance.now() - started) / 1000).toFixed(1)} s -> ${outDir}`,
);
for (const r of failed) {
  console.log(`FAILED ${r.id}: ${r.error}`);
}
if (failed.length > 0) {
  process.exitCode = 1;
}
