local cip = import '7.62x51.json';
cip + {
  id: '308-winchester',
  designation: '.308 Winchester',
  // A case about 12 mm across needs the fine grain to keep its shoulder, neck and bullet; the item grain draws blocks.
  voxelGrain: 0.002,
  aliases: [{ name: '308 Win.', cite: { source: 'cip308', locator: 'Tab. I, sheet title' } }],
  relatedTo: [],
  overallLength: cip.overallLength + {
    typical: { value: null, cite: null, note: 'The governing drawing gives a maximum, not a typical loaded length.' },
  },
  notes: [
    'Civilian cartridge identity using the C.I.P. 308 Win. cartridge-maximum drawing shared with the frame-sizing reference. Separate identity does not authorize cross-loading with 7.62x51.',
    'Unsupported primer, material and projectile-length data remain unknown in the governing record.',
  ],
}
