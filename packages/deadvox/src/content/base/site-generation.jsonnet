{
  siteGeneration: [
    {
      id: 'authored',
      activeZombieRadiusMetres: 40,
      topography: {
        amplitudeMetres: 0.65,
        wavelengthMetres: 28,
        buildingMarginMetres: 5,
        roadShoulderMetres: 4,
        spawnMarginMetres: 8,
      },
      terrain: {
        minHeightMetres: 8,
        maxHeightMetres: 56,
        beachBelowMetres: 14,
        dirtDepthMetres: 2,
        featureSizeMetres: 96,
        octaves: 4,
      },
      vegetation: {
        woodlandEdgeWavelengthMetres: 20,
        woodlandEdgeVariation: 0.3,
        openDensity: 0.035,
        obstacleMarginMetres: 1,
        treeMix: ['broadleaf', 'broadleaf', 'conifer', 'young'],
        treeCellMetres: 8,
        treeJitterMetres: 1.5,
        trees: {
          trunkHalfWidthMetres: 0.25,
          branchLayer: { topDropMetres: 1, thicknessMetres: 0.5 },
          shapes: {
            broadleaf: {
              crown: { kind: 'ellipsoid', centreMetres: 5.5, radiiMetres: [3, 2, 2.5] },
              heightMetres: 5,
              branchReachMetres: 2,
            },
            conifer: {
              crown: { kind: 'cone', baseMetres: 2, topMetres: 8.5, taper: 0.38, minHalfWidthMetres: 0.25 },
              heightMetres: 8.5,
              branchReachMetres: 1,
            },
            young: {
              crown: { kind: 'ellipsoid', centreMetres: 3.25, radiiMetres: [1.5, 1.5, 1.5] },
              heightMetres: 3.25,
              branchReachMetres: 1,
            },
          },
        },
        forestHalfExtentMetres: 384,
        forestDensityField: {
          wavelengthMetres: 128,
          seedSalt: 137,
          floor: 0.2,
          gain: 1,
          ceiling: 0.75,
        },
      },
      palette: {
        terrain: { grass: 'grass', dirt: 'dirt', rock: 'rock', sand: 'sand' },
        paving: 'asphalt',
        trees: { trunk: 'tree_trunk', branch: 'tree_branch', leaves: 'leaves' },
        leafLitter: 'leaf_litter',
      },
    },
  ],
}
