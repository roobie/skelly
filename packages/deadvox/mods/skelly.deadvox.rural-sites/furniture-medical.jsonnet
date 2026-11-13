local shape = import 'tools/jsonnet/lib/furniture-shape.libsonnet';
local breach = import 'tools/jsonnet/lib/furniture-breach.libsonnet';
local cabinets = import 'tools/jsonnet/lib/cabinet-shapes.libsonnet';
breach.breaking(shape.colliding({
  furniture: [
    {
      id: 'medical_research_notice',
      name: 'Medical sampling notice board',
      size: [1, 1, 1],
      color: '#b8b5a5',
      mount: 'wall',
      solid: false,
      shape: [{ position: [0, 0, 0.875], size: [1, 1, 0.125] }],
      readable: {
        title: 'Sampling station notice',
        text: 'COMMUNITY HEALTH SITE — VIRAL SAMPLING\n\nThis hall was requisitioned for observation and collection of viral samples. Intake records are kept in the lab. Supplies arrive from the military camp; keep the pharmacy stocked for staff.',
      },
    },
    {
      id: 'medical_cabinet',
      name: 'Medical supply cabinet',
      size: [2, 3, 1],
      color: '#a8ada4',
      shape: cabinets.supply(self.size, {
        shell: '#c4cac3', frame: '#929e96', door: '#d6dbd4', upper: '#7f9c9e',
        metal: '#aebcb9', shadow: '#384642', wear: '#eff0e3', badge: '#e8ebe6',
      }, medical=true),
      container: { pockets: [{ grid: [9, 14], handlingSimSeconds: 1.2 }] },
    },
    { id: 'sample_rack', name: 'Specimen rack', size: [2, 3, 1], color: '#7c8581' },
    { id: 'sample_tray', name: 'Sample tray', size: [2, 1, 1], color: '#b6c1bc' },
  ],
}))
