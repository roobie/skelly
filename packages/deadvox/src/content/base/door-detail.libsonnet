// How doorway leaves and hatches show they open: raised fields, hinge straps on the hinge edge and a handle by
// the free edge. A door picks the look that matches how it is built, and overrides a value where its size needs
// one. Lengths are metres. See `packages/deadvox/docs/content.md`, "Door detail".
local brass = '#c6b98e';
local steel = '#a9adb0';
{
  // A timber house door: two raised panels and a lever.
  panelled: {
    hardware: brass, relief: 0.012, frame: 0.1, seam: 0.12, fields: [1, 2],
    hinges: { count: 3, length: 0.16, width: 0.05 },
    handle: { kind: 'lever', fromFreeEdge: 0.1, along: 0.5, length: 0.12, thickness: 0.02 },
  },
  // A sheet-steel door: one flush field inside a narrow frame.
  flush: {
    hardware: steel, relief: 0.008, frame: 0.05, seam: 0.05, fields: [1, 1],
    hinges: { count: 3, length: 0.1, width: 0.06 },
    handle: { kind: 'lever', fromFreeEdge: 0.1, along: 0.5, length: 0.14, thickness: 0.025 },
  },
  // Corrugated steel, ribs running up the leaf, with a long locking pull.
  ribbed: {
    hardware: steel, relief: 0.015, frame: 0.06, seam: 0.05, fields: [5, 1],
    hinges: { count: 4, length: 0.08, width: 0.06 },
    handle: { kind: 'pull', fromFreeEdge: 0.12, along: 0.45, length: 0.5, thickness: 0.03 },
  },
  // Horizontal slats lifted by a low bar.
  slatted: {
    hardware: steel, relief: 0.012, frame: 0, seam: 0.03, fields: [1, 10],
    hinges: { count: 0, length: 0.1, width: 0.06 },
    handle: { kind: 'bar', fromFreeEdge: 1.5, along: 0.08, length: 0.3, thickness: 0.03 },
  },
  // A hatch set in a floor or roof, lifted by a flat ring; its hardware is dark against galvanised steel.
  hatch: {
    hardware: '#4a5053', relief: 0.008, frame: 0.06, seam: 0.06, fields: [1, 1],
    hinges: { count: 2, length: 0.2, width: 0.05 },
    handle: { kind: 'ring', fromFreeEdge: 0.14, along: 0.5, length: 0.14, thickness: 0.018 },
  },
}
