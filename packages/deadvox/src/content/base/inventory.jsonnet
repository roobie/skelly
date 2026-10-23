{
  inventory: [
    {
      id: 'player',
      conditionBands: [
        { from: 0, word: 'ruined' },
        { from: 0.1, word: 'badly damaged' },
        { from: 0.3, word: 'damaged' },
        { from: 0.6, word: 'worn' },
        { from: 0.9, word: 'pristine' },
      ],
      cellMetres: 0.1,
      containerMaxWidthCells: 10,
      groundPileStateCap: 65536,
      reachMetres: 2,
      chestHeightMetres: 1,
      useReachMetres: 2,
      search: { minSimSeconds: 1, maxSimSeconds: 3, cellsForMax: 160 },
      throwFlightSimSeconds: 0.75,
      throwArcHeightMetres: 1.1,
      throwDrag: { airDensityKgPerCubicMetre: 1.2, footprintDragCoefficient: 0.25 },
      furnitureMove: {
        maxSizeMetres: 1,
        liftStamina: 15,
        carryStaminaPerSimSecond: 4,
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
