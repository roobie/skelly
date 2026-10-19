{
  inventory: [
    {
      id: 'player',
      containerMaxWidthCells: 10,
      reachMetres: 2,
      chestHeightMetres: 1,
      useReachMetres: 2,
      search: { minSimSeconds: 1, maxSimSeconds: 3, cellsForMax: 48 },
      throwFlightSimSeconds: 0.75,
      throwArcHeightMetres: 1.1,
      furnitureMove: {
        maxSizeMetres: 1,
        liftStamina: 15,
        carryStaminaPerSimSecond: 4,
        carriedView: {
          offsetMetres: [0, -0.5, -0.9],
          sizeMetres: 0.45,
          bobMetres: 0.015,
          bobPerSecond: 0.5,
        },
      },
    },
  ],
}
