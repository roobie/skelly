local material(color) = { color: color, emissive: 0 };
local humanoid = {
  skin: material([0, 0, 0]),
  bruise: material([0.34, 0.27, 0.33]),
  shirt: material([0, 0, 0]),
  pants: material([0, 0, 0]),
  shoe: material([0.12, 0.1, 0.09]),
  hair: material([0.11, 0.09, 0.08]),
  eye: material([0.06, 0.06, 0.06]),
  mouth: material([0.24, 0.05, 0.06]),
  gore: material([0.32, 0.09, 0.06]),
  bone: material([0.85, 0.82, 0.72]),
};
{
  humanoid: {
    materials: humanoid,
    materialHsl: {
      skin: ['skinHue', 'skinSat', 'skinLight'],
      shirt: ['shirtHue', 0.32, 'shirtLight'],
      pants: ['pantsHue', 0.28, 'pantsLight'],
    },
  },
  dog: {
    materials: humanoid + {
      bruise: material([0.3, 0.24, 0.29]),
      hair: material([0.1, 0.08, 0.07]),
      eye: material([0.05, 0.04, 0.04]),
      mouth: material([0.22, 0.05, 0.06]),
    },
    materialHsl: {
      skin: ['skinHue', 'skinSat', 'skinLight'],
      shirt: ['skinHue', 'skinSat', 'skinLight'],
      pants: ['skinHue', 'skinSat', 'skinLight'],
    },
  },
}
