// A three-axle bonneted road tractor: 7.3 m long, 2.5 m wide, with a sleeper cab, roof fairing, twin stacks and a bare fifth wheel.
{
  tailLampZ: 0.5, rear: -3.65, front: 3.62, side: 1.24, face: 1.72, cabBack: 0.38, doorRear: 0.46,
  floor: 1.22, waist: 2.22, roof: 2.96, lean: 0.22,
  frontAxle: 2.72, rearAxles: [-1.85, -3.1],
  wheel: 'wheel_295_80r22_5', r: 0.522, wheelW: 0.295,
  railBottom: 0.74, railTop: 0.99,
  engine: 'engine_i6_heavy_diesel', engineLength: 1.12, gearbox: 'gearbox_heavy', gearboxLength: 0.95, radiator: 'radiator_truck',
  paint: 'paint-oxblood',
  chassisMass: 2500, shellMass: 1480,
  bonnet: { nose: 3.46, back: 2.2, front: 1.98, z: 0.72 },
  bumperPaint: 'steel-stainless',
  radiatorX: 3.2, radiatorY: 0.72,
  tankX: -0.42, batteryX: 0.55,
  // The bonnet leaves a short cab, so the dash is shallow and the seat sits back against the sleeper wall.
  seatX: 0.9, dashDepth: 0.3,
  // Sleeper and coupling
  sleeperBack: -0.95, fairingTop: 3.72, fifthX: -2.45, fifthTop: 1.28,
}
