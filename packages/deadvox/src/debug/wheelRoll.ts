import { type PlacedFitting, rollingRadius, type VehicleFittingDef } from '@skelly/engine/content';
import { Group, type Object3D } from 'three';

/**
 * A spinning content fitting's axle, the model frame's x axis through its place, carrying the fitting's body. Turning
 * about +x rolls the top of the rim forward, along +z; `roll` turns it as the vehicle travels a distance in metres.
 */
export const contentAxle = (
  def: VehicleFittingDef,
  placed: PlacedFitting,
  body: Object3D,
): { readonly axle: Group; readonly roll: (distance: number) => void } => {
  const radius = rollingRadius(def.at, placed.collision);
  const axle = new Group();
  axle.position.set(...def.at);
  body.position.set(-def.at[0], -def.at[1], -def.at[2]);
  axle.add(body);
  return {
    axle,
    roll: (distance) => {
      axle.rotation.x += distance / radius;
    },
  };
};
