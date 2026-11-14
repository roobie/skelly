{
  inventory: [
    {
      id: 'player',
      capability: 'player',
      conditionBands: [
        { from: 0, word: 'ruined', color: '#d23c32' },
        { from: 0.1, word: 'badly damaged', color: '#e8862a' },
        { from: 0.3, word: 'damaged', color: '#e3c832' },
        { from: 0.6, word: 'worn', color: '#6f9a5a' },
        { from: 0.9, word: 'pristine', color: '#3ee05a' },
      ],
      repairCeiling: 'worn',
      cellMetres: 0.1,
      containerMaxWidthCells: 10,
      keyHoldRealSeconds: 0.35,
      handling: { perCellSimSeconds: 0.05, groundSimSeconds: 1, wearSimSeconds: 2 },
      groundPileStateCap: 65536,
      autoPlacementTallMinFreeAreaGainCells: 4,
      reachMetres: 2,
      chestHeightMetres: 1,
      useReachMetres: 2,
      search: { minSimSeconds: 1, maxSimSeconds: 3, cellsForMax: 160 },
      throwFlightSimSeconds: 0.75,
      throwDrag: { airDensityKgPerCubicMetre: 1.2, footprintDragCoefficient: 0.25 },
      furnitureMove: {
        maxSizeMetres: 1,
        fatigue: {
          lift: { base: 15, perKg: 0.2 },
          drag: { base: 8, perKg: 0.1 },
          carry: { basePerSimSecond: 4, perKgPerSimSecond: 0.05 },
        },
        slide: { stepSimSeconds: 2 },
        carriedView: {
          offsetMetres: [0, -0.5, -0.9],
          sizeMetres: 0.45,
          bobMetres: 0.015,
          bobPerRealSecond: 0.5,
        },
      },
    },
  ],
}
