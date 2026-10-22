import { RawIntegrationParameters } from "../raw";
export declare class IntegrationParameters {
    raw: RawIntegrationParameters;
    constructor(raw?: RawIntegrationParameters);
    free(): void;
    get dt(): number;
    get contact_erp(): number;
    get lengthUnit(): number;
    get normalizedAllowedLinearError(): number;
    get normalizedPredictionDistance(): number;
    get numSolverIterations(): number;
    get numInternalPgsIterations(): number;
    get minIslandSize(): number;
    get maxCcdSubsteps(): number;
    set dt(value: number);
    set contact_natural_frequency(value: number);
    set lengthUnit(value: number);
    set normalizedAllowedLinearError(value: number);
    set normalizedPredictionDistance(value: number);
    set numSolverIterations(value: number);
    set numInternalPgsIterations(value: number);
    set minIslandSize(value: number);
    set maxCcdSubsteps(value: number);
}
