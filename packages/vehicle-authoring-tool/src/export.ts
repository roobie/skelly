/** A content-file fragment written by VAT for Deadvox's vehicle-blueprint section. */
export interface VehicleBlueprintExport {
  readonly vehicleBlueprints: readonly [
    {
      readonly id: string;
      readonly name: string;
      readonly fittings: readonly VehicleFittingExport[];
    },
  ];
}

export interface VehicleFittingExport {
  readonly id: string;
  readonly part: string;
  readonly at: readonly [number, number, number];
  readonly mirror?: true | undefined;
  readonly supportedBy: readonly string[];
  readonly cargo?: readonly [number, number, number] | undefined;
  readonly service?:
    | {
        readonly name: string;
        readonly mount: string;
        readonly durationSimSeconds: number;
        readonly qualities: Readonly<Record<string, number>>;
      }
    | undefined;
}

export interface VehicleBlueprintInput {
  readonly id: string;
  readonly name: string;
  readonly fittings: readonly VehicleFittingExport[];
}

/** Writes the Deadvox content shape; Deadvox remains the validator of parts and fitting relationships. */
export const exportVehicleBlueprint = ({ id, name, fittings }: VehicleBlueprintInput): VehicleBlueprintExport => ({
  vehicleBlueprints: [{ id, name, fittings }],
});
