local shape = import 'furniture-shape.libsonnet';
local breach = import 'furniture-breach.libsonnet';
local cabinets = import 'cabinet-shapes.libsonnet';
local wood = '#6e5037';
breach.breaking(shape.colliding({
  furniture: [
    {
      id: 'dad_front_door',
      name: "Dad's cabin front door",
      size: [2, 4, 1],
      color: '#7a5534',
      material: 'wood',
      breach: { minimumStrength: 3.5, durability: 60 },
      door: { methods: {}, handlingSimSeconds: 0.6 },
    },
    {
      id: 'gun_cabinet',
      name: 'Gun cabinet',
      size: [2, 4, 1],
      color: wood,
      shape: cabinets.gun(self.size, {
        shell: wood, frame: '#4a3729', door: '#805e40', metal: '#85867e',
        shadow: '#292922', wear: '#aa8760', badge: '#b3a17a',
      }),
      container: { pockets: [{ grid: [5, 14], handlingSimSeconds: 1.2 }] },
    },
  ],
}))
