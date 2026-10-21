local shape = import 'furniture-shape.libsonnet';
local box(position, size) = { position: position, size: size };
local pocket = { pockets: [{ grid: [6, 6], handlingSimSeconds: 1.2 }] };
local basin = [
  box([0.15, 0, 0.3], [0.35, 1.4, 0.5]),
  box([1.5, 0, 0.3], [0.35, 1.4, 0.5]),
  box([0.1, 1.3, 0.15], [1.8, 0.12, 0.75]),
  box([0, 1.4, 0.1], [0.15, 0.25, 0.8]),
  box([1.85, 1.4, 0.1], [0.15, 0.25, 0.8]),
  box([0, 1.4, 0.1], [2, 0.25, 0.12]),
  box([0, 1.4, 0.78], [2, 0.25, 0.12]),
  box([0.9, 1.65, 0.75], [0.12, 0.3, 0.12]),
  box([0.9, 1.83, 0.45], [0.12, 0.12, 0.42]),
];
local toilet = [
  box([0.45, 0, 0.5], [1.1, 0.2, 1.2]),
  box([0.7, 0.2, 0.7], [0.6, 0.65, 0.7]),
  box([0.25, 0.85, 0.25], [0.3, 0.3, 1.35]),
  box([1.45, 0.85, 0.25], [0.3, 0.3, 1.35]),
  box([0.25, 0.85, 0.25], [1.5, 0.3, 0.3]),
  box([0.25, 0.85, 1.3], [1.5, 0.3, 0.3]),
  box([0.3, 0.5, 1.6], [1.4, 1.35, 0.35]),
  box([0.2, 1.85, 1.55], [1.6, 0.15, 0.45]),
];
shape.colliding({
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
    { id: 'station_toilet', name: 'Toilet', size: [2, 2, 2], color: '#deddd3', shape: toilet },
    { id: 'station_cell_toilet', name: 'Cell toilet', size: [2, 2, 2], color: '#8b9494', shape: toilet },
    { id: 'station_washbasin', name: 'Washbasin', size: [2, 2, 1], color: '#deddd3', shape: basin },
    { id: 'station_cleaning_sink', name: 'Cleaning sink', size: [2, 2, 1], color: '#8b9494', shape: basin },
    { id: 'station_kitchen_sink', name: 'Kitchen sink', size: [2, 2, 1], color: '#b0b7b3', shape: basin },
    {
      id: 'station_solid_fuel_boiler', name: 'Solid-fuel boiler', size: [3, 6, 2], color: '#535b58',
      shape: [
        box([0.2, 0, 0.2], [0.4, 0.3, 1.6]),
        box([2.4, 0, 0.2], [0.4, 0.3, 1.6]),
        box([0.15, 0.3, 0.3], [2.7, 2.5, 1.5]),
        box([0.3, 2.8, 0.45], [2.4, 0.2, 1.2]),
        box([0.5, 0.7, 0.2], [2, 1.5, 0.1]),
        box([0.65, 0.85, 0.1], [1.7, 1.2, 0.1]),
        box([1.9, 1.3, 0], [0.3, 0.18, 0.15]),
        box([1.2, 3, 1.1], [0.6, 3, 0.6]),
      ],
    },
    {
      id: 'station_coal_bin', name: 'Coal bin', size: [3, 2, 2], color: '#383d3b',
      shape: [
        box([0, 0, 0], [3, 0.15, 2]),
        box([0, 0.15, 0], [0.15, 1.5, 2]),
        box([2.85, 0.15, 0], [0.15, 1.5, 2]),
        box([0.15, 0.15, 0], [2.7, 0.65, 0.15]),
        box([0.15, 0.15, 1.85], [2.7, 1.5, 0.15]),
        box([0.2, 0.15, 0.2], [2.6, 0.6, 1.6]),
        box([0.4, 0.75, 0.5], [0.7, 0.45, 0.6]),
        box([1, 0.75, 0.8], [0.8, 0.65, 0.8]),
        box([1.8, 0.75, 0.3], [0.8, 0.4, 0.8]),
      ],
    },
    {
      id: 'station_coal_hatch', name: 'Coal delivery hatch', size: [2, 2, 1], color: '#596562',
      door: { material: 'steel', methods: {}, handlingSimSeconds: 0.6, breach: { minimumStrength: 9, toughness: 300 } },
    },
    {
      id: 'station_cooker', name: 'Cooker', size: [2, 2, 1], color: '#b7b9ae',
      shape: [
        box([0.1, 0, 0.1], [1.8, 1.7, 0.9]),
        box([0, 1.7, 0], [2, 0.1, 1]),
        box([0.2, 1.8, 0.15], [0.55, 0.07, 0.25]),
        box([1.25, 1.8, 0.15], [0.55, 0.07, 0.25]),
        box([0.2, 1.8, 0.6], [0.55, 0.07, 0.25]),
        box([1.25, 1.8, 0.6], [0.55, 0.07, 0.25]),
        box([0.2, 1.45, 0], [0.15, 0.15, 0.1]),
        box([0.65, 1.45, 0], [0.15, 0.15, 0.1]),
        box([1.1, 1.45, 0], [0.15, 0.15, 0.1]),
        box([1.55, 1.45, 0], [0.15, 0.15, 0.1]),
        box([0.3, 1.1, 0], [1.4, 0.1, 0.1]),
      ],
    },
    {
      id: 'station_emergency_door', name: 'Emergency exit door', size: [2, 4, 1], color: '#8c9b91',
      door: { material: 'steel', methods: {}, handlingSimSeconds: 0.6, breach: { minimumStrength: 9, toughness: 300 } },
    },
  ],
})
