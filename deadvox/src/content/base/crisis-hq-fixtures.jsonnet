local box(position, size) = { position: position, size: size };
local cabinets = import 'cabinet-shapes.libsonnet';
local weaponPaint = '#657063';
{
  furniture: [
    {
      id: 'hq_weapon_cabinet', name: 'Weapon cabinet', size: [3, 5, 2], color: weaponPaint,
      container: { pockets: [{ grid: [10, 12], handlingSimSeconds: 1.2 }] },
      shape: cabinets.gun(self.size, {
        shell: weaponPaint, frame: '#454f45', door: '#768170', metal: '#a1aaa0',
        shadow: '#252e29', wear: '#929b86', badge: '#b9bba7',
      }),
    },
    {
      id: 'hq_meeting_table', name: 'Meeting table', size: [6, 2, 3], color: '#77664c',
      shape: [
        box([0.1, 1.7, 0.1], [5.8, 0.3, 2.8]),
        box([0.3, 0, 0.3], [0.3, 1.7, 0.3]),
        box([5.4, 0, 0.3], [0.3, 1.7, 0.3]),
        box([0.3, 0, 2.4], [0.3, 1.7, 0.3]),
        box([5.4, 0, 2.4], [0.3, 1.7, 0.3]),
      ],
    },
    {
      id: 'hq_generator', name: 'Generator', size: [4, 3, 3], color: '#59634e',
      shape: [
        box([0.1, 0, 0.1], [3.8, 0.3, 2.8]),
        box([0.3, 0.3, 0.3], [2, 1.8, 2.4]),
        box([2.3, 0.3, 0.6], [1.4, 1.3, 1.8]),
        box([0.5, 2.1, 0.5], [1.6, 0.4, 2]),
        box([0.5, 0.7, 0.1], [0.8, 0.6, 0.2]),
        box([1.6, 0.7, 0.1], [0.3, 0.3, 0.2]),
        box([3.1, 1.6, 2.1], [0.25, 1.4, 0.25]),
      ],
    },
  ],
}
