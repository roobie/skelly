import { RotationOps, VectorOps, scratchBuffer } from "../math";
import { SdpMatrix3Ops } from "../math";
export var RigidBodyType;
(function (RigidBodyType) {
    RigidBodyType[RigidBodyType["Dynamic"] = 0] = "Dynamic";
    RigidBodyType[RigidBodyType["Fixed"] = 1] = "Fixed";
    RigidBodyType[RigidBodyType["KinematicPositionBased"] = 2] = "KinematicPositionBased";
    RigidBodyType[RigidBodyType["KinematicVelocityBased"] = 3] = "KinematicVelocityBased";
    RigidBodyType[RigidBodyType["SoftFrame"] = 4] = "SoftFrame";
})(RigidBodyType || (RigidBodyType = {}));
export class RigidBody {
    constructor(rawSet, colliderSet, handle) {
        this.rawSet = rawSet;
        this.colliderSet = colliderSet;
        this.handle = handle;
    }
    finalizeDeserialization(colliderSet) {
        this.colliderSet = colliderSet;
    }
    isValid() {
        return this.rawSet.contains(this.handle);
    }
    lockTranslations(locked, wakeUp) {
        return this.rawSet.rbLockTranslations(this.handle, locked, wakeUp);
    }
    lockRotations(locked, wakeUp) {
        return this.rawSet.rbLockRotations(this.handle, locked, wakeUp);
    }
    setEnabledTranslations(enableX, enableY, enableZ, wakeUp) {
        return this.rawSet.rbSetEnabledTranslations(this.handle, enableX, enableY, enableZ, wakeUp);
    }
    restrictTranslations(enableX, enableY, enableZ, wakeUp) {
        this.setEnabledTranslations(enableX, enableY, enableZ, wakeUp);
    }
    setEnabledRotations(enableX, enableY, enableZ, wakeUp) {
        return this.rawSet.rbSetEnabledRotations(this.handle, enableX, enableY, enableZ, wakeUp);
    }
    restrictRotations(enableX, enableY, enableZ, wakeUp) {
        this.setEnabledRotations(enableX, enableY, enableZ, wakeUp);
    }
    dominanceGroup() {
        return this.rawSet.rbDominanceGroup(this.handle);
    }
    setDominanceGroup(group) {
        this.rawSet.rbSetDominanceGroup(this.handle, group);
    }
    additionalSolverIterations() {
        return this.rawSet.rbAdditionalSolverIterations(this.handle);
    }
    additionalPgsIterations() {
        return this.rawSet.rbAdditionalPgsIterations(this.handle);
    }
    setAdditionalPgsIterations(iterations) {
        this.rawSet.rbSetAdditionalPgsIterations(this.handle, iterations);
    }
    isSoftFrame() {
        return this.rawSet.rbIsSoftFrame(this.handle);
    }
    softBody() {
        let handle = this.rawSet.rbSoftBody(this.handle);
        return handle === undefined ? null : handle;
    }
    softCluster() {
        let cluster = this.rawSet.rbSoftCluster(this.handle);
        return cluster === undefined ? null : cluster;
    }
    setAdditionalSolverIterations(iters) {
        this.rawSet.rbSetAdditionalSolverIterations(this.handle, iters);
    }
    enableCcd(enabled) {
        this.rawSet.rbEnableCcd(this.handle, enabled);
    }
    setSoftCcdPrediction(distance) {
        this.rawSet.rbSetSoftCcdPrediction(this.handle, distance);
    }
    softCcdPrediction() {
        return this.rawSet.rbSoftCcdPrediction(this.handle);
    }
    translation(target) {
        this.rawSet.rbTranslation(this.handle, scratchBuffer);
        return VectorOps.fromBuffer(scratchBuffer, target);
    }
    rotation(target) {
        this.rawSet.rbRotation(this.handle, scratchBuffer);
        return RotationOps.fromBuffer(scratchBuffer, target);
    }
    nextTranslation(target) {
        this.rawSet.rbNextTranslation(this.handle, scratchBuffer);
        return VectorOps.fromBuffer(scratchBuffer, target);
    }
    nextRotation(target) {
        this.rawSet.rbNextRotation(this.handle, scratchBuffer);
        return RotationOps.fromBuffer(scratchBuffer, target);
    }
    setTranslation(tra, wakeUp) {
        this.rawSet.rbSetTranslation(this.handle, tra.x, tra.y, tra.z, wakeUp);
    }
    setLinvel(vel, wakeUp) {
        let rawVel = VectorOps.intoRaw(vel);
        this.rawSet.rbSetLinvel(this.handle, rawVel, wakeUp);
        rawVel.free();
    }
    gravityScale() {
        return this.rawSet.rbGravityScale(this.handle);
    }
    setGravityScale(factor, wakeUp) {
        this.rawSet.rbSetGravityScale(this.handle, factor, wakeUp);
    }
    setRotation(rot, wakeUp) {
        this.rawSet.rbSetRotation(this.handle, rot.x, rot.y, rot.z, rot.w, wakeUp);
    }
    setAngvel(vel, wakeUp) {
        let rawVel = VectorOps.intoRaw(vel);
        this.rawSet.rbSetAngvel(this.handle, rawVel, wakeUp);
        rawVel.free();
    }
    setNextKinematicTranslation(t) {
        this.rawSet.rbSetNextKinematicTranslation(this.handle, t.x, t.y, t.z);
    }
    setNextKinematicRotation(rot) {
        this.rawSet.rbSetNextKinematicRotation(this.handle, rot.x, rot.y, rot.z, rot.w);
    }
    linvel(target) {
        this.rawSet.rbLinvel(this.handle, scratchBuffer);
        return VectorOps.fromBuffer(scratchBuffer, target);
    }
    velocityAtPoint(point, target) {
        const rawPoint = VectorOps.intoRaw(point);
        this.rawSet.rbVelocityAtPoint(this.handle, rawPoint, scratchBuffer);
        rawPoint.free();
        return VectorOps.fromBuffer(scratchBuffer, target);
    }
    angvel(target) {
        this.rawSet.rbAngvel(this.handle, scratchBuffer);
        return VectorOps.fromBuffer(scratchBuffer, target);
    }
    mass() {
        return this.rawSet.rbMass(this.handle);
    }
    effectiveInvMass(target) {
        this.rawSet.rbEffectiveInvMass(this.handle, scratchBuffer);
        return VectorOps.fromBuffer(scratchBuffer, target);
    }
    invMass() {
        return this.rawSet.rbInvMass(this.handle);
    }
    localCom(target) {
        this.rawSet.rbLocalCom(this.handle, scratchBuffer);
        return VectorOps.fromBuffer(scratchBuffer, target);
    }
    worldCom(target) {
        this.rawSet.rbWorldCom(this.handle, scratchBuffer);
        return VectorOps.fromBuffer(scratchBuffer, target);
    }
    invPrincipalInertia(target) {
        this.rawSet.rbInvPrincipalInertia(this.handle, scratchBuffer);
        return VectorOps.fromBuffer(scratchBuffer, target);
    }
    principalInertia(target) {
        this.rawSet.rbPrincipalInertia(this.handle, scratchBuffer);
        return VectorOps.fromBuffer(scratchBuffer, target);
    }
    principalInertiaLocalFrame(target) {
        this.rawSet.rbPrincipalInertiaLocalFrame(this.handle, scratchBuffer);
        return RotationOps.fromBuffer(scratchBuffer, target);
    }
    effectiveWorldInvInertia(target) {
        this.rawSet.rbEffectiveWorldInvInertia(this.handle, scratchBuffer);
        return SdpMatrix3Ops.fromBuffer(scratchBuffer, target);
    }
    effectiveAngularInertia(target) {
        this.rawSet.rbEffectiveAngularInertia(this.handle, scratchBuffer);
        return SdpMatrix3Ops.fromBuffer(scratchBuffer, target);
    }
    sleep() {
        this.rawSet.rbSleep(this.handle);
    }
    wakeUp() {
        this.rawSet.rbWakeUp(this.handle);
    }
    isCcdEnabled() {
        return this.rawSet.rbIsCcdEnabled(this.handle);
    }
    numColliders() {
        return this.rawSet.rbNumColliders(this.handle);
    }
    collider(i) {
        return this.colliderSet.get(this.rawSet.rbCollider(this.handle, i));
    }
    setEnabled(enabled) {
        this.rawSet.rbSetEnabled(this.handle, enabled);
    }
    isEnabled() {
        return this.rawSet.rbIsEnabled(this.handle);
    }
    bodyType() {
        return this.rawSet.rbBodyType(this.handle);
    }
    setBodyType(type, wakeUp) {
        return this.rawSet.rbSetBodyType(this.handle, type, wakeUp);
    }
    isSleeping() {
        return this.rawSet.rbIsSleeping(this.handle);
    }
    isMoving() {
        return this.rawSet.rbIsMoving(this.handle);
    }
    isFixed() {
        return this.rawSet.rbIsFixed(this.handle);
    }
    isKinematic() {
        return this.rawSet.rbIsKinematic(this.handle);
    }
    isDynamic() {
        return this.rawSet.rbIsDynamic(this.handle);
    }
    linearDamping() {
        return this.rawSet.rbLinearDamping(this.handle);
    }
    angularDamping() {
        return this.rawSet.rbAngularDamping(this.handle);
    }
    setLinearDamping(factor) {
        this.rawSet.rbSetLinearDamping(this.handle, factor);
    }
    recomputeMassPropertiesFromColliders() {
        this.rawSet.rbRecomputeMassPropertiesFromColliders(this.handle, this.colliderSet.raw);
    }
    setAdditionalMass(mass, wakeUp) {
        this.rawSet.rbSetAdditionalMass(this.handle, mass, wakeUp);
    }
    setAdditionalMassProperties(mass, centerOfMass, principalAngularInertia, angularInertiaLocalFrame, wakeUp) {
        let rawCom = VectorOps.intoRaw(centerOfMass);
        let rawPrincipalInertia = VectorOps.intoRaw(principalAngularInertia);
        let rawInertiaFrame = RotationOps.intoRaw(angularInertiaLocalFrame);
        this.rawSet.rbSetAdditionalMassProperties(this.handle, mass, rawCom, rawPrincipalInertia, rawInertiaFrame, wakeUp);
        rawCom.free();
        rawPrincipalInertia.free();
        rawInertiaFrame.free();
    }
    setAngularDamping(factor) {
        this.rawSet.rbSetAngularDamping(this.handle, factor);
    }
    resetForces(wakeUp) {
        this.rawSet.rbResetForces(this.handle, wakeUp);
    }
    resetTorques(wakeUp) {
        this.rawSet.rbResetTorques(this.handle, wakeUp);
    }
    addForce(force, wakeUp) {
        const rawForce = VectorOps.intoRaw(force);
        this.rawSet.rbAddForce(this.handle, rawForce, wakeUp);
        rawForce.free();
    }
    applyImpulse(impulse, wakeUp) {
        const rawImpulse = VectorOps.intoRaw(impulse);
        this.rawSet.rbApplyImpulse(this.handle, rawImpulse, wakeUp);
        rawImpulse.free();
    }
    addTorque(torque, wakeUp) {
        const rawTorque = VectorOps.intoRaw(torque);
        this.rawSet.rbAddTorque(this.handle, rawTorque, wakeUp);
        rawTorque.free();
    }
    applyTorqueImpulse(torqueImpulse, wakeUp) {
        const rawTorqueImpulse = VectorOps.intoRaw(torqueImpulse);
        this.rawSet.rbApplyTorqueImpulse(this.handle, rawTorqueImpulse, wakeUp);
        rawTorqueImpulse.free();
    }
    addForceAtPoint(force, point, wakeUp) {
        const rawForce = VectorOps.intoRaw(force);
        const rawPoint = VectorOps.intoRaw(point);
        this.rawSet.rbAddForceAtPoint(this.handle, rawForce, rawPoint, wakeUp);
        rawForce.free();
        rawPoint.free();
    }
    applyImpulseAtPoint(impulse, point, wakeUp) {
        const rawImpulse = VectorOps.intoRaw(impulse);
        const rawPoint = VectorOps.intoRaw(point);
        this.rawSet.rbApplyImpulseAtPoint(this.handle, rawImpulse, rawPoint, wakeUp);
        rawImpulse.free();
        rawPoint.free();
    }
    userForce(target) {
        this.rawSet.rbUserForce(this.handle, scratchBuffer);
        return VectorOps.fromBuffer(scratchBuffer, target);
    }
    userTorque(target) {
        this.rawSet.rbUserTorque(this.handle, scratchBuffer);
        return VectorOps.fromBuffer(scratchBuffer, target);
    }
}
export class RigidBodyDesc {
    constructor(status) {
        this.enabled = true;
        this.status = status;
        this.translation = VectorOps.zeros();
        this.rotation = RotationOps.identity();
        this.gravityScale = 1.0;
        this.linvel = VectorOps.zeros();
        this.mass = 0.0;
        this.massOnly = false;
        this.centerOfMass = VectorOps.zeros();
        this.translationsEnabledX = true;
        this.translationsEnabledY = true;
        this.angvel = VectorOps.zeros();
        this.principalAngularInertia = VectorOps.zeros();
        this.angularInertiaLocalFrame = RotationOps.identity();
        this.translationsEnabledZ = true;
        this.rotationsEnabledX = true;
        this.rotationsEnabledY = true;
        this.rotationsEnabledZ = true;
        this.linearDamping = 0.0;
        this.angularDamping = 0.0;
        this.canSleep = true;
        this.sleeping = false;
        this.ccdEnabled = false;
        this.softCcdPrediction = 0.0;
        this.dominanceGroup = 0;
        this.additionalSolverIterations = 0;
        this.additionalPgsIterations = 0;
    }
    static dynamic() {
        return new RigidBodyDesc(RigidBodyType.Dynamic);
    }
    static kinematicPositionBased() {
        return new RigidBodyDesc(RigidBodyType.KinematicPositionBased);
    }
    static kinematicVelocityBased() {
        return new RigidBodyDesc(RigidBodyType.KinematicVelocityBased);
    }
    static fixed() {
        return new RigidBodyDesc(RigidBodyType.Fixed);
    }
    static newDynamic() {
        return new RigidBodyDesc(RigidBodyType.Dynamic);
    }
    static newKinematicPositionBased() {
        return new RigidBodyDesc(RigidBodyType.KinematicPositionBased);
    }
    static newKinematicVelocityBased() {
        return new RigidBodyDesc(RigidBodyType.KinematicVelocityBased);
    }
    static newStatic() {
        return new RigidBodyDesc(RigidBodyType.Fixed);
    }
    setDominanceGroup(group) {
        this.dominanceGroup = group;
        return this;
    }
    setAdditionalSolverIterations(iters) {
        this.additionalSolverIterations = iters;
        return this;
    }
    setAdditionalPgsIterations(iters) {
        this.additionalPgsIterations = iters;
        return this;
    }
    setEnabled(enabled) {
        this.enabled = enabled;
        return this;
    }
    setTranslation(x, y, z) {
        if (typeof x != "number" ||
            typeof y != "number" ||
            typeof z != "number")
            throw TypeError("The translation components must be numbers.");
        this.translation = { x: x, y: y, z: z };
        return this;
    }
    setRotation(rot) {
        RotationOps.copy(this.rotation, rot);
        return this;
    }
    setGravityScale(scale) {
        this.gravityScale = scale;
        return this;
    }
    setAdditionalMass(mass) {
        this.mass = mass;
        this.massOnly = true;
        return this;
    }
    setLinvel(x, y, z) {
        if (typeof x != "number" ||
            typeof y != "number" ||
            typeof z != "number")
            throw TypeError("The linvel components must be numbers.");
        this.linvel = { x: x, y: y, z: z };
        return this;
    }
    setAngvel(vel) {
        VectorOps.copy(this.angvel, vel);
        return this;
    }
    setAdditionalMassProperties(mass, centerOfMass, principalAngularInertia, angularInertiaLocalFrame) {
        this.mass = mass;
        VectorOps.copy(this.centerOfMass, centerOfMass);
        VectorOps.copy(this.principalAngularInertia, principalAngularInertia);
        RotationOps.copy(this.angularInertiaLocalFrame, angularInertiaLocalFrame);
        this.massOnly = false;
        return this;
    }
    enabledTranslations(translationsEnabledX, translationsEnabledY, translationsEnabledZ) {
        this.translationsEnabledX = translationsEnabledX;
        this.translationsEnabledY = translationsEnabledY;
        this.translationsEnabledZ = translationsEnabledZ;
        return this;
    }
    restrictTranslations(translationsEnabledX, translationsEnabledY, translationsEnabledZ) {
        return this.enabledTranslations(translationsEnabledX, translationsEnabledY, translationsEnabledZ);
    }
    lockTranslations() {
        return this.enabledTranslations(false, false, false);
    }
    enabledRotations(rotationsEnabledX, rotationsEnabledY, rotationsEnabledZ) {
        this.rotationsEnabledX = rotationsEnabledX;
        this.rotationsEnabledY = rotationsEnabledY;
        this.rotationsEnabledZ = rotationsEnabledZ;
        return this;
    }
    restrictRotations(rotationsEnabledX, rotationsEnabledY, rotationsEnabledZ) {
        return this.enabledRotations(rotationsEnabledX, rotationsEnabledY, rotationsEnabledZ);
    }
    lockRotations() {
        return this.restrictRotations(false, false, false);
    }
    setLinearDamping(damping) {
        this.linearDamping = damping;
        return this;
    }
    setAngularDamping(damping) {
        this.angularDamping = damping;
        return this;
    }
    setCanSleep(can) {
        this.canSleep = can;
        return this;
    }
    setSleeping(sleeping) {
        this.sleeping = sleeping;
        return this;
    }
    setCcdEnabled(enabled) {
        this.ccdEnabled = enabled;
        return this;
    }
    setSoftCcdPrediction(distance) {
        this.softCcdPrediction = distance;
        return this;
    }
    setUserData(data) {
        this.userData = data;
        return this;
    }
}
