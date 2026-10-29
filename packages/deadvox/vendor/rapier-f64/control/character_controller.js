import { RawKinematicCharacterController, RawCharacterCollision } from "../raw";
import { VectorOps, scratchBuffer } from "../math";
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
    computedMovement(target) {
        this.raw.computedMovement(scratchBuffer);
        return VectorOps.fromBuffer(scratchBuffer, target);
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
            c.translationDeltaApplied(scratchBuffer);
            out.translationDeltaApplied = VectorOps.fromBuffer(scratchBuffer, out.translationDeltaApplied);
            c.translationDeltaRemaining(scratchBuffer);
            out.translationDeltaRemaining = VectorOps.fromBuffer(scratchBuffer, out.translationDeltaRemaining);
            out.toi = c.toi();
            c.worldWitness1(scratchBuffer);
            out.witness1 = VectorOps.fromBuffer(scratchBuffer, out.witness1);
            c.worldWitness2(scratchBuffer);
            out.witness2 = VectorOps.fromBuffer(scratchBuffer, out.witness2);
            c.worldNormal1(scratchBuffer);
            out.normal1 = VectorOps.fromBuffer(scratchBuffer, out.normal1);
            c.worldNormal2(scratchBuffer);
            out.normal2 = VectorOps.fromBuffer(scratchBuffer, out.normal2);
            out.collider = this.colliders.get(c.handle());
            return out;
        }
    }
}
