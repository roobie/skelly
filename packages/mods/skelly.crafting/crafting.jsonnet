local skillCurve = import 'packages/mods/skelly.progression/skill-curve.libsonnet';
{
  skills: [skill { curve: skillCurve } for skill in [
    { id: 'crafting', capability: 'crafting', name: 'Crafting', training: { craftingTierOffset: 1 } },
    { id: 'mechanics', capability: 'mechanics', name: 'Mechanics', training: { craftingTierOffset: 1 } },
  ]],
  recipeCategories: [
    { id: 'supplies', label: 'Supplies', order: 10 },
    { id: 'materials', label: 'Materials', parent: 'supplies', order: 10 },
    { id: 'tools', label: 'Tools and kits', parent: 'supplies', order: 20 },
    { id: 'lighting', label: 'Lighting', parent: 'supplies', order: 30 },
    { id: 'attachments', label: 'Weapon attachments', parent: 'supplies', order: 40 },
    { id: 'fixtures', label: 'Fixtures', order: 20 },
    { id: 'repairs', label: 'Repairs', order: 30 },
    { id: 'repair_tools', label: 'Tools and weapons', parent: 'repairs', order: 10 },
    { id: 'repair_clothing', label: 'Clothing and bags', parent: 'repairs', order: 20 },
    { id: 'repair_electrical', label: 'Electrical equipment', parent: 'repairs', order: 30 },
  ],
  recipeTags: [
    { id: 'wood', label: 'Wood', searchTerms: ['timber'] },
    { id: 'metal', label: 'Metal', searchTerms: [] },
    { id: 'textile', label: 'Textiles', searchTerms: ['cloth', 'fabric'] },
    { id: 'electrical', label: 'Electrical', searchTerms: ['wiring'] },
    { id: 'edge', label: 'Sharpening', searchTerms: ['blade', 'edge'] },
  ],
}
