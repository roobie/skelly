import { RawIntegrationParameters } from "../raw";
import { SoftRecoverySettings } from "./soft_body";
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
    get maxCcdSubsteps() {
        return this.raw.maxCcdSubsteps;
    }
    get softBodiesResweepStrain() {
        return this.raw.softBodiesResweepStrain;
    }
    get softBodiesMaxExtraSubsteps() {
        return this.raw.softBodiesMaxExtraSubsteps;
    }
    get softBodiesContactStiffening() {
        return this.raw.softBodiesContactStiffening;
    }
    get softBodiesRecovery() {
        return SoftRecoverySettings.fromRaw(this.raw.softBodiesRecovery);
    }
    get softBodiesFemLinearTolerance() {
        return this.raw.softBodiesFemLinearTolerance;
    }
    get softBodiesFemMaxLinearIterations() {
        return this.raw.softBodiesFemMaxLinearIterations;
    }
    get softBodiesFemMaxDenseDofs() {
        return this.raw.softBodiesFemMaxDenseDofs;
    }
    set dt(value) {
        this.raw.dt = value;
    }
    set softBodiesResweepStrain(value) {
        this.raw.softBodiesResweepStrain = value;
    }
    set softBodiesMaxExtraSubsteps(value) {
        this.raw.softBodiesMaxExtraSubsteps = value;
    }
    set softBodiesContactStiffening(value) {
        this.raw.softBodiesContactStiffening = value;
    }
    set softBodiesRecovery(value) {
        let raw = value.intoRaw();
        this.raw.softBodiesRecovery = raw;
        raw.free();
    }
    set softBodiesFemLinearTolerance(value) {
        this.raw.softBodiesFemLinearTolerance = value;
    }
    set softBodiesFemMaxLinearIterations(value) {
        this.raw.softBodiesFemMaxLinearIterations = value;
    }
    set softBodiesFemMaxDenseDofs(value) {
        this.raw.softBodiesFemMaxDenseDofs = value;
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
    set maxCcdSubsteps(value) {
        this.raw.maxCcdSubsteps = value;
    }
}
