local solidFill = { fraction: 1, source: 'Authored solids represent the full material envelope.' };
local role(material, fill=solidFill, slots={}) = { material: material, fill: fill, slotMaterials: slots };
local metalRoles = [
  'receiver', 'ak-receiver', 'bolt-carrier', 'ar-charging-handle', 'bolt-handle', 'bolt-handle-arm',
  'bolt-handle-knob', 'smg-handle', 'lower', 'barrel', 'ak-muzzle-device', 'ak-rear-sight', 'tube-magazine',
  'magazine', 'frame', 'slide', 'cylinder', 'front-sight', 'front-sight-bead', 'rail-front-sight',
  'sporting-rear-sight', 'gas-block', 'gas-cylinder', 'revolver-frame', 'revolver-cylinder', 'revolver-crane',
  'revolver-ejector', 'revolver-hammer', 'revolver-trigger', 'revolver-barrel', 'muzzle-brake', 'barrel-shroud',
  'bipod', 'carry-handle', 'handle-trunnion', 'handle-strut', 'handle-bar', 'monopod', 'heavy-receiver',
  'heavy-lower', 'heavy-magazine', 'heavy-bolt-carrier',
];
local furnitureRoles = ['forend', 'handguard', 'grip', 'stock', 'foregrip', 'revolver-grip', 'recoil-stock'];
{
  roles: { [id]: role('steel-parkerized') for id in metalRoles } +
         { [id]: role('polymer-black') for id in furnitureRoles } + {
    sight: role('alu-anodized-black', {
      fraction: 1,
      source: 'Calibrated against Aimpoint Micro T-2: 0.080 kg computed versus 0.096 kg published',
    }),
    suppressor: role('steel-stainless', {
      fraction: 0.7,
      source: 'https://www.surefire.com/socom556-rc2/ (published 5.56 suppressor envelope and mass)',
    }),
    'tactical-flashlight-mount': role('alu-anodized-black'),
    'cartridge-model': role('brass', solidFill, { case: 'brass', bullet: 'lead', primer: 'brass', hull: 'plastic-red', closure: 'paperboard-brown' }),
  },
  slotMaterials: { furniture: 'polymer-black', accent: 'rubber-black' },
  solidMaterials: { stockPad: 'rubber-black', magazineMetal: 'steel-blued', chargingHandle: 'alu-anodized-black' },
  solidFinishes: { rubber: { material: 'rubber-black', slot: 'accent' } },
}
