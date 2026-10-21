import { RawIntegrationParameters } from "../raw";
export class IntegrationParameters {
    constructor(raw) {
        this.raw = raw || new RawIntegrationParameters();
    }
    free() {
        if (!!this.raw) {
            this.raw.free();
        }
        this.raw = undefined;
    }
    get dt() {
        return this.raw.dt;
    }
    get contact_erp() {
        return this.raw.contact_erp;
    }
    get lengthUnit() {
        return this.raw.lengthUnit;
    }
    get normalizedAllowedLinearError() {
        return this.raw.normalizedAllowedLinearError;
    }
    get normalizedPredictionDistance() {
        return this.raw.normalizedPredictionDistance;
    }
    get numSolverIterations() {
        return this.raw.numSolverIterations;
    }
    get numInternalPgsIterations() {
        return this.raw.numInternalPgsIterations;
    }
    get minIslandSize() {
        return this.raw.minIslandSize;
    }
    get maxCcdSubsteps() {
        return this.raw.maxCcdSubsteps;
    }
    set dt(value) {
        this.raw.dt = value;
    }
    set contact_natural_frequency(value) {
        this.raw.contact_natural_frequency = value;
    }
    set lengthUnit(value) {
        this.raw.lengthUnit = value;
    }
    set normalizedAllowedLinearError(value) {
        this.raw.normalizedAllowedLinearError = value;
    }
    set normalizedPredictionDistance(value) {
        this.raw.normalizedPredictionDistance = value;
    }
    set numSolverIterations(value) {
        this.raw.numSolverIterations = value;
    }
    set numInternalPgsIterations(value) {
        this.raw.numInternalPgsIterations = value;
    }
    set minIslandSize(value) {
        this.raw.minIslandSize = value;
    }
    set maxCcdSubsteps(value) {
        this.raw.maxCcdSubsteps = value;
    }
}
