{
  skills: [
    {
      id: 'inventory_management',
      capability: 'inventoryManagement',
      name: 'Inventory Management (IM)',
      training: { activities: { handling: { practice: 2.5 } } },
      inventory: {
        handlingFactorFloor: 0,
        handlingFactorHalfLifeLevels: 1.1,
      },
      curve: import 'tools/jsonnet/lib/skill-curve.libsonnet',
    },
  ],
  skillProgression: [{ id: 'core', capability: 'progression', practicePerLevel: 10 }],
}
