import type { PowerDeviceState, PowerState } from '../src/core/power.ts';
import { exactUnits, POWER_UNITS, type PowerDeviceDef } from '../src/core/powerContent.ts';
import { simTimestamp } from '../src/core/time.ts';

export const powerDefinitions: PowerDeviceDef[] = [
  { id: 'generator', kind: 'generator', priority: 0, outputWatts: 47, burnLitresPerGameHour: 1.3 },
  { id: 'panel', kind: 'solar', priority: 0, outputWatts: { night: 0, dawn: 9, day: 28, dusk: 9 } },
  { id: 'first', kind: 'battery', priority: 0, capacityWh: 17, chargeEfficiency: 0.83, dischargeEfficiency: 0.91 },
  { id: 'second', kind: 'battery', priority: 1, capacityWh: 23, chargeEfficiency: 0.87, dischargeEfficiency: 0.89 },
  { id: 'high', kind: 'consumer', priority: 0, demandWatts: 19 },
  { id: 'low', kind: 'consumer', priority: 1, demandWatts: 11 },
];
export const powerTuning = { id: 'fixture', tickSimSeconds: 7 };
export const powerClock = { start: 0, ratio: 60 };
export const powerCycle = { latitudeDegrees: 52, date: { month: 4, day: 9 }, twilight: 'nautical' } as const;
export const rateChangeAt = simTimestamp(17.3);

export const deviceState = (id: string, type = id): PowerDeviceState => ({
  id,
  type,
  enabled: true,
  fuelUnits: 0,
  storedMicrojoules: 0,
  powered: false,
  restartBlocked: false,
});

export const powerState = (): PowerState => ({
  atGameMilliseconds: 0,
  devices: [
    { ...deviceState('generator'), fuelUnits: exactUnits(0.77, POWER_UNITS.amount) },
    deviceState('panel'),
    { ...deviceState('first'), storedMicrojoules: exactUnits(2.4, POWER_UNITS.amount) },
    { ...deviceState('second'), storedMicrojoules: exactUnits(3.7, POWER_UNITS.amount) },
    { ...deviceState('high'), enabled: false },
    deviceState('low'),
  ],
  links: ['panel', 'first', 'second', 'high', 'low'].map((to, index) => ({
    from: 'generator',
    to,
    itemUid: index + 1,
  })),
});
