local base = import 'archetype-ar.json';
base + {
  calibre: '7.62x51',
  assembly: base.assembly + {
    name: 'archetype-ar-large',
    description: 'AR-10 class rifle in 7.62×51 on the large AR frame, with an A2 front-sight block at the gas station.',
    parts: base.assembly.parts + {
      receiver: { item: 'receiver_ar_large' },
      'charging-handle': { item: 'charging_handle_ar_large' },
      'bolt-carrier': { item: 'bolt_carrier_ar_large' },
      lower: { item: 'lower_ar_large' },
      barrel: { item: 'barrel_ar_large_medium' },
      handguard: { item: 'handguard_ar_large_clamped' },
    },
  },
}
