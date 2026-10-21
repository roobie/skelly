import { RawKinematicCharacterController, RawCharacterCollision } from "../raw";
import { VectorOps } from "../math";
export class CharacterCollision {
}
export class KinematicCharacterController {
    constructor(offset, params, broadPhase, narrowPhase, bodies, colliders) {
        this.params = params;
        this.bodies = bodies;
        this.colliders = colliders;
        this.broadPhase = broadPhase;
        this.narrowPhase = narrowPhase;
        this.raw = new RawKinematicCharacterController(offset);
        this.rawCharacterCollision = new RawCharacterCollision();
        this._applyImpulsesToDynamicBodies = false;
        this._characterMass = null;
    }
    free() {
        if (!!this.raw) {
            this.raw.free();
            this.rawCharacterCollision.free();
        }
        this.raw = undefined;
        this.rawCharacterCollision = undefined;
    }
    up() {
        return this.raw.up();
    }
    setUp(vector) {
        let rawVect = VectorOps.intoRaw(vector);
        return this.raw.setUp(rawVect);
        rawVect.free();
    }
    applyImpulsesToDynamicBodies() {
        return this._applyImpulsesToDynamicBodies;
    }
    setApplyImpulsesToDynamicBodies(enabled) {
        this._applyImpulsesToDynamicBodies = enabled;
    }
    characterMass() {
        return this._characterMass;
    }
    setCharacterMass(mass) {
        this._characterMass = mass;
    }
    offset() {
        return this.raw.offset();
    }
    setOffset(value) {
        this.raw.setOffset(value);
    }
    normalNudgeFactor() {
        return this.raw.normalNudgeFactor();
    }
    setNormalNudgeFactor(value) {
        this.raw.setNormalNudgeFactor(value);
    }
    slideEnabled() {
        return this.raw.slideEnabled();
    }
    setSlideEnabled(enabled) {
        this.raw.setSlideEnabled(enabled);
    }
    autostepMaxHeight() {
        return this.raw.autostepMaxHeight();
    }
    autostepMinWidth() {
        return this.raw.autostepMinWidth();
    }
    autostepIncludesDynamicBodies() {
        return this.raw.autostepIncludesDynamicBodies();
    }
    autostepEnabled() {
        return this.raw.autostepEnabled();
    }
    enableAutostep(maxHeight, minWidth, includeDynamicBodies) {
        this.raw.enableAutostep(maxHeight, minWidth, includeDynamicBodies);
    }
    disableAutostep() {
        return this.raw.disableAutostep();
    }
    maxSlopeClimbAngle() {
        return this.raw.maxSlopeClimbAngle();
    }
    setMaxSlopeClimbAngle(angle) {
        this.raw.setMaxSlopeClimbAngle(angle);
    }
    minSlopeSlideAngle() {
        return this.raw.minSlopeSlideAngle();
    }
    setMinSlopeSlideAngle(angle) {
        this.raw.setMinSlopeSlideAngle(angle);
    }
    snapToGroundDistance() {
        return this.raw.snapToGroundDistance();
    }
    enableSnapToGround(distance) {
        this.raw.enableSnapToGround(distance);
    }
    disableSnapToGround() {
        this.raw.disableSnapToGround();
    }
    snapToGroundEnabled() {
        return this.raw.snapToGroundEnabled();
    }
    computeColliderMovement(collider, desiredTranslationDelta, filterFlags, filterGroups, filterPredicate) {
        let rawTranslationDelta = VectorOps.intoRaw(desiredTranslationDelta);
        this.raw.computeColliderMovement(this.params.dt, this.broadPhase.raw, this.narrowPhase.raw, this.bodies.raw, this.colliders.raw, collider.handle, rawTranslationDelta, this._applyImpulsesToDynamicBodies, this._characterMass, filterFlags, filterGroups, this.colliders.castClosure(filterPredicate));
        rawTranslationDelta.free();
    }
    computedMovement() {
        return VectorOps.fromRaw(this.raw.computedMovement());
    }
    computedGrounded() {
        return this.raw.computedGrounded();
    }
    numComputedCollisions() {
        return this.raw.numComputedCollisions();
    }
    computedCollision(i, out) {
        if (!this.raw.computedCollision(i, this.rawCharacterCollision)) {
            return null;
        }
        else {
            let c = this.rawCharacterCollision;
            out = out ?? new CharacterCollision();
            out.translationDeltaApplied = VectorOps.fromRaw(c.translationDeltaApplied());
            out.translationDeltaRemaining = VectorOps.fromRaw(c.translationDeltaRemaining());
            out.toi = c.toi();
            out.witness1 = VectorOps.fromRaw(c.worldWitness1());
            out.witness2 = VectorOps.fromRaw(c.worldWitness2());
            out.normal1 = VectorOps.fromRaw(c.worldNormal1());
            out.normal2 = VectorOps.fromRaw(c.worldNormal2());
            out.collider = this.colliders.get(c.handle());
            return out;
        }
    }
}
