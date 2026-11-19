local shape = import 'tools/jsonnet/lib/furniture-shape.libsonnet';
local breach = import 'tools/jsonnet/lib/furniture-breach.libsonnet';
local detail = import 'tools/jsonnet/lib/door-detail.libsonnet';
local box(position, size) = { position: position, size: size };
local pocket = { pockets: [{ grid: [6, 6], handlingSimSeconds: 1.2 }] };
breach.breaking(shape.colliding({
  furniture: [
    {
      id: 'police_desk_radio', name: 'Desk radio', size: [2, 1, 1], color: '#4c5950',
      shape: [
        box([0.1, 0, 0.15], [1.8, 0.65, 0.75]),
        box([0.2, 0.1, 0.08], [0.9, 0.4, 0.07]),
        box([1.25, 0.1, 0.02], [0.2, 0.2, 0.15]),
        box([1.6, 0.1, 0.02], [0.2, 0.2, 0.15]),
        box([1.75, 0.65, 0.7], [0.06, 0.35, 0.06]),
        box([0.2, 0.65, 0.4], [0.2, 0.12, 0.2]),
        box([1.1, 0.65, 0.4], [0.2, 0.12, 0.2]),
        box([0.2, 0.77, 0.4], [1.1, 0.18, 0.2]),
      ],
    },
    {
      id: 'police_duty_notice', name: 'Duty notice', size: [1, 1, 1], color: '#d7d0b4',
      mount: 'wall', solid: false,
      shape: [box([0, 0, 0.9], [1, 1, 0.1])],
      readable: { title: 'Duty notice', text: 'EVIDENCE\n\nLog every transfer. Sign out keys at the duty desk.' },
    },
    {
      id: 'police_file_cabinet', name: 'File cabinet', size: [2, 4, 1], color: '#79857c',
      container: pocket, appearance: { kind: 'drawers', surface: 'painted-metal' },
    },
    {
      id: 'police_evidence_locker', name: 'Evidence locker', size: [2, 4, 1], color: '#68777b',
      container: pocket, appearance: { kind: 'cabinet', surface: 'painted-metal' },
    },
    {
      id: 'station_emergency_door', name: 'Emergency exit door', size: [2, 4, 1], color: '#8c9b91', material: 'steel',
      breach: { minimumStrength: 9, durability: 300 },
      // A fire exit opens on a push bar across the leaf.
      door: {
        methods: {}, handlingSimSeconds: 0.6,
        detail: detail.flush + {
          fields: [1, 2],
          handle: { kind: 'bar', fromFreeEdge: 0.35, along: 0.5, length: 0.6, thickness: 0.03 },
        },
      },
    },
  ],
}))
