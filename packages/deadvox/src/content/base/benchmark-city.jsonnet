{
  cityBenchmarks: [{
    id: 'stress_city',
    settlementKind: 'city',
    pool: 'benchmark_city',
    street: 12, blockX: 104, blockZ: 64,
    pad: 2, gap: 2, blend: 24, rows: 2,
    reachMetres: 200,
  }],
  mapPools: [{
    id: 'benchmark_city',
    choices: [
      { ref: { kind: 'template', id: id }, weight: 1 }
      for id in ['small_house', 'bungalow', 'corner_store', 'hardware_store', 'gas_station', 'shed', 'garage']
    ],
  }],
}
