local layout = (import '../skelly.deadvox.scenario.test-house/layouts-test-house.jsonnet').layouts[0];
{
  layouts: [layout + {
    id: 'testHouseHoldoutWorkshopSupportLook',
    buildings: layout.buildings + [
      { template: 'holdout_power_plant', position: [20, 20.5, 14], rotation: 0 },
      { template: 'workshop_office', position: [28, 20.5, 14], rotation: 0 },
      { template: 'workshop_parts_store', position: [36, 20.5, 14], rotation: 0 },
      { template: 'workshop_hall', position: [20, 20.5, 28], rotation: 0 },
    ],
    player: { position: [23, 21, 20], bearing: 0 },
    showroom: layout.showroom + { slots: [] },
  }],
}
