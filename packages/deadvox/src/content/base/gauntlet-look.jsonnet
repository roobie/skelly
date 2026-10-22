local shape = import 'furniture-shape.libsonnet';
local breach = import 'furniture-breach.libsonnet';
local lab = import 'gauntlet-lab.libsonnet';
local metal = '#707b7e';
breach.breaking(shape.colliding({
  furniture: lab.furniture + [
    {
      id: 'gauntlet_look_exhaust',
      name: 'Service exhaust',
      size: [4, 8, 2],
      color: metal,
      shape: [
        { position: [0.2, 0, 0.4], size: [1.2, 8, 1.2] },
        { position: [2.5, 0, 0.4], size: [1.2, 8, 1.2] },
        { position: [0, 0, 0], size: [4, 1, 2] },
      ],
    },
    {
      id: 'gauntlet_look_bollard', name: 'Utility bollard', size: [2, 4, 2], color: metal,
      shape: [
        { position: [0.4, 0, 0.4], size: [1.2, 3.8, 1.2] },
        { position: [0.2, 3.6, 0.2], size: [1.6, 0.4, 1.6] },
      ],
    },
    {
      id: 'gauntlet_look_cabinet', name: 'Utility cabinet', size: [4, 3, 2], color: metal,
      shape: [
        { position: [0, 0, 0], size: [4, 0.4, 2] },
        { position: [0.1, 0.4, 0.1], size: [3.8, 2.6, 1.8] },
      ],
    },
    {
      id: 'gauntlet_look_riser', name: 'Service duct riser', size: [3, 5, 3], color: metal,
      shape: [
        { position: [0.4, 0, 0.4], size: [1, 5, 1] },
        { position: [0.4, 4, 0.4], size: [2.6, 1, 1] },
        { position: [0, 0, 0], size: [2, 0.4, 2] },
      ],
    },
    {
      id: 'gauntlet_look_bench', name: 'Prototype workbench', size: [4, 2, 2], color: '#acb4b1',
      shape: [
        { position: [0, 1.6, 0], size: [4, 0.4, 2] },
        { position: [0.2, 0, 0.2], size: [0.3, 1.6, 1.6] },
        { position: [3.5, 0, 0.2], size: [0.3, 1.6, 1.6] },
      ],
    },
    {
      id: 'gauntlet_look_console', name: 'Prototype objective console', size: [4, 2, 2], color: '#7c868c',
      shape: [
        { position: [0, 0, 0], size: [4, 1.2, 2] },
        { position: [0, 1.2, 0], size: [4, 0.8, 0.3] },
        { position: [0, 1.2, 0.3], size: [4, 0.2, 1.7] },
      ],
    },
    {
      id: 'gauntlet_look_containment_bay', name: 'Prototype containment bay', size: [4, 4, 2], color: '#b29a61',
      shape: [
        { position: [0, 0, 0], size: [4, 0.3, 2] },
        { position: [0, 3.7, 0], size: [4, 0.3, 2] },
        { position: [0, 0.3, 0], size: [0.3, 3.4, 2] },
        { position: [3.7, 0.3, 0], size: [0.3, 3.4, 2] },
        { position: [1.8, 0.3, 0.8], size: [0.4, 2.8, 0.4] },
      ],
    },
    {
      id: 'gauntlet_look_breached_bay', name: 'Prototype breached containment bay', size: [4, 5, 2], color: '#9b5550',
      shape: [
        { position: [0, 0, 0], size: [4, 0.3, 2] },
        { position: [0, 4.7, 0], size: [4, 0.3, 2] },
        { position: [0, 0.3, 0], size: [0.3, 4.4, 2] },
        { position: [3.7, 0.3, 1.7], size: [0.3, 4.4, 0.3] },
        { position: [0.3, 0.3, 0.5], size: [2.2, 0.25, 0.3] },
      ],
    },
    {
      id: 'gauntlet_look_spill', name: 'Prototype spill mark — no active hazard', size: [4, 1, 3], color: '#742e30', solid: false,
      shape: [
        { position: [0.4, 0, 0.1], size: [2.9, 0.05, 1.7] },
        { position: [1.2, 0, 1.5], size: [2.6, 0.05, 1.2] },
      ],
    },
    {
      id: 'gauntlet_look_button', name: 'Prototype nuclear objective button', size: [1, 1, 1], color: '#c94b3d',
      shape: [{ position: [0.2, 0, 0.2], size: [0.6, 0.3, 0.6] }],
      readable: {
        title: 'Prototype console — inactive',
        text: 'This is a visual placeholder for the nuclear objective button. This look has no goal command and cannot record a win.',
      },
    },
  ],

}))
