import { BroadPhase, ColliderSet, NarrowPhase, } from "../geometry";
import { CCDSolver, IntegrationParameters, IslandManager, ImpulseJointSet, MultibodyJointSet, RigidBodySet, } from "../dynamics";
import { VectorOps } from "../math";
import { PhysicsPipeline } from "./physics_pipeline";
import { SerializationPipeline } from "./serialization_pipeline";
import { DebugRenderBuffers, DebugRenderPipeline } from "./debug_render_pipeline";
import { KinematicCharacterController, PidController, } from "../control";
import { DynamicRayCastVehicleController } from "../control";
export class World {
    free() {
        this.integrationParameters.free();
        this.islands.free();
        this.broadPhase.free();
        this.narrowPhase.free();
        this.bodies.free();
        this.colliders.free();
        this.impulseJoints.free();
        this.multibodyJoints.free();
        this.ccdSolver.free();
        this.physicsPipeline.free();
        this.serializationPipeline.free();
        this.debugRenderPipeline.free();
        this.characterControllers.forEach((controller) => controller.free());
        this.pidControllers.forEach((controller) => controller.free());
        this.vehicleControllers.forEach((controller) => controller.free());
        this.integrationParameters = undefined;
        this.islands = undefined;
        this.broadPhase = undefined;
        this.narrowPhase = undefined;
        this.bodies = undefined;
        this.colliders = undefined;
        this.ccdSolver = undefined;
        this.impulseJoints = undefined;
        this.multibodyJoints = undefined;
        this.physicsPipeline = undefined;
        this.serializationPipeline = undefined;
        this.debugRenderPipeline = undefined;
        this.characterControllers = undefined;
        this.pidControllers = undefined;
        this.vehicleControllers = undefined;
    }
    constructor(gravity, rawIntegrationParameters, rawIslands, rawBroadPhase, rawNarrowPhase, rawBodies, rawColliders, rawImpulseJoints, rawMultibodyJoints, rawCCDSolver, rawPhysicsPipeline, rawSerializationPipeline, rawDebugRenderPipeline) {
        this.gravity = gravity;
        this.integrationParameters = new IntegrationParameters(rawIntegrationParameters);
        this.islands = new IslandManager(rawIslands);
        this.broadPhase = new BroadPhase(rawBroadPhase);
        this.narrowPhase = new NarrowPhase(rawNarrowPhase);
        this.bodies = new RigidBodySet(rawBodies);
        this.colliders = new ColliderSet(rawColliders);
        this.impulseJoints = new ImpulseJointSet(rawImpulseJoints);
        this.multibodyJoints = new MultibodyJointSet(rawMultibodyJoints);
        this.ccdSolver = new CCDSolver(rawCCDSolver);
        this.physicsPipeline = new PhysicsPipeline(rawPhysicsPipeline);
        this.serializationPipeline = new SerializationPipeline(rawSerializationPipeline);
        this.debugRenderPipeline = new DebugRenderPipeline(rawDebugRenderPipeline);
        this.characterControllers = new Set();
        this.pidControllers = new Set();
        this.vehicleControllers = new Set();
        this.impulseJoints.finalizeDeserialization(this.bodies);
        this.bodies.finalizeDeserialization(this.colliders);
        this.colliders.finalizeDeserialization(this.bodies);
    }
    static fromRaw(raw) {
        if (!raw)
            return null;
        return new World(VectorOps.fromRaw(raw.takeGravity()), raw.takeIntegrationParameters(), raw.takeIslandManager(), raw.takeBroadPhase(), raw.takeNarrowPhase(), raw.takeBodies(), raw.takeColliders(), raw.takeImpulseJoints(), raw.takeMultibodyJoints());
    }
    takeSnapshot() {
        return this.serializationPipeline.serializeAll(this.gravity, this.integrationParameters, this.islands, this.broadPhase, this.narrowPhase, this.bodies, this.colliders, this.impulseJoints, this.multibodyJoints);
    }
    static restoreSnapshot(data) {
        let deser = new SerializationPipeline();
        return deser.deserializeAll(data);
    }
    debugRender(filterFlags, filterPredicate) {
        this.debugRenderPipeline.render(this.bodies, this.colliders, this.impulseJoints, this.multibodyJoints, this.narrowPhase, filterFlags, filterPredicate);
        return new DebugRenderBuffers(this.debugRenderPipeline.vertices, this.debugRenderPipeline.colors);
    }
    step(eventQueue, hooks) {
        this.physicsPipeline.step(this.gravity, this.integrationParameters, this.islands, this.broadPhase, this.narrowPhase, this.bodies, this.colliders, this.impulseJoints, this.multibodyJoints, this.ccdSolver, eventQueue, hooks);
    }
    propagateModifiedBodyPositionsToColliders() {
        this.bodies.raw.propagateModifiedBodyPositionsToColliders(this.colliders.raw);
    }
    get timestep() {
        return this.integrationParameters.dt;
    }
    set timestep(dt) {
        this.integrationParameters.dt = dt;
    }
    get lengthUnit() {
        return this.integrationParameters.lengthUnit;
    }
    set lengthUnit(unitsPerMeter) {
        this.integrationParameters.lengthUnit = unitsPerMeter;
    }
    get numSolverIterations() {
        return this.integrationParameters.numSolverIterations;
    }
    set numSolverIterations(niter) {
        this.integrationParameters.numSolverIterations = niter;
    }
    get numInternalPgsIterations() {
        return this.integrationParameters.numInternalPgsIterations;
    }
    set numInternalPgsIterations(niter) {
        this.integrationParameters.numInternalPgsIterations = niter;
    }
    get maxCcdSubsteps() {
        return this.integrationParameters.maxCcdSubsteps;
    }
    set maxCcdSubsteps(substeps) {
        this.integrationParameters.maxCcdSubsteps = substeps;
    }
    createRigidBody(body) {
        return this.bodies.createRigidBody(this.colliders, body);
    }
    createCharacterController(offset) {
        let controller = new KinematicCharacterController(offset, this.integrationParameters, this.broadPhase, this.narrowPhase, this.bodies, this.colliders);
        this.characterControllers.add(controller);
        return controller;
    }
    removeCharacterController(controller) {
        this.characterControllers.delete(controller);
        controller.free();
    }
    createPidController(kp, ki, kd, axes) {
        let controller = new PidController(this.integrationParameters, this.bodies, kp, ki, kd, axes);
        this.pidControllers.add(controller);
        return controller;
    }
    removePidController(controller) {
        this.pidControllers.delete(controller);
        controller.free();
    }
    createVehicleController(chassis) {
        let controller = new DynamicRayCastVehicleController(chassis, this.broadPhase, this.narrowPhase, this.bodies, this.colliders);
        this.vehicleControllers.add(controller);
        return controller;
    }
    removeVehicleController(controller) {
        this.vehicleControllers.delete(controller);
        controller.free();
    }
    createCollider(desc, parent) {
        let parentHandle = parent ? parent.handle : undefined;
        return this.colliders.createCollider(this.bodies, desc, parentHandle);
    }
    createImpulseJoint(params, parent1, parent2, wakeUp) {
        return this.impulseJoints.createJoint(this.bodies, params, parent1.handle, parent2.handle, wakeUp);
    }
    createMultibodyJoint(params, parent1, parent2, wakeUp) {
        return this.multibodyJoints.createJoint(params, parent1.handle, parent2.handle, wakeUp);
    }
    getRigidBody(handle) {
        return this.bodies.get(handle);
    }
    getCollider(handle) {
        return this.colliders.get(handle);
    }
    getImpulseJoint(handle) {
        return this.impulseJoints.get(handle);
    }
    getMultibodyJoint(handle) {
        return this.multibodyJoints.get(handle);
    }
    removeRigidBody(body) {
        if (this.bodies) {
            this.bodies.remove(body.handle, this.islands, this.colliders, this.impulseJoints, this.multibodyJoints);
        }
    }
    removeCollider(collider, wakeUp) {
        if (this.colliders) {
            this.colliders.remove(collider.handle, this.islands, this.bodies, wakeUp);
        }
    }
    removeImpulseJoint(joint, wakeUp) {
        if (this.impulseJoints) {
            this.impulseJoints.remove(joint.handle, wakeUp);
        }
    }
    removeMultibodyJoint(joint, wakeUp) {
        if (this.impulseJoints) {
            this.multibodyJoints.remove(joint.handle, wakeUp);
        }
    }
    forEachCollider(f) {
        this.colliders.forEach(f);
    }
    forEachRigidBody(f) {
        this.bodies.forEach(f);
    }
    forEachActiveRigidBody(f) {
        this.bodies.forEachActiveRigidBody(this.islands, f);
    }
    castRay(ray, maxToi, solid, filterFlags, filterGroups, filterExcludeCollider, filterExcludeRigidBody, filterPredicate) {
        return this.broadPhase.castRay(this.narrowPhase, this.bodies, this.colliders, ray, maxToi, solid, filterFlags, filterGroups, filterExcludeCollider ? filterExcludeCollider.handle : null, filterExcludeRigidBody ? filterExcludeRigidBody.handle : null, this.colliders.castClosure(filterPredicate));
    }
    castRayAndGetNormal(ray, maxToi, solid, filterFlags, filterGroups, filterExcludeCollider, filterExcludeRigidBody, filterPredicate) {
        return this.broadPhase.castRayAndGetNormal(this.narrowPhase, this.bodies, this.colliders, ray, maxToi, solid, filterFlags, filterGroups, filterExcludeCollider ? filterExcludeCollider.handle : null, filterExcludeRigidBody ? filterExcludeRigidBody.handle : null, this.colliders.castClosure(filterPredicate));
    }
    intersectionsWithRay(ray, maxToi, solid, callback, filterFlags, filterGroups, filterExcludeCollider, filterExcludeRigidBody, filterPredicate) {
        this.broadPhase.intersectionsWithRay(this.narrowPhase, this.bodies, this.colliders, ray, maxToi, solid, callback, filterFlags, filterGroups, filterExcludeCollider ? filterExcludeCollider.handle : null, filterExcludeRigidBody ? filterExcludeRigidBody.handle : null, this.colliders.castClosure(filterPredicate));
    }
    intersectionWithShape(shapePos, shapeRot, shape, filterFlags, filterGroups, filterExcludeCollider, filterExcludeRigidBody, filterPredicate) {
        let handle = this.broadPhase.intersectionWithShape(this.narrowPhase, this.bodies, this.colliders, shapePos, shapeRot, shape, filterFlags, filterGroups, filterExcludeCollider ? filterExcludeCollider.handle : null, filterExcludeRigidBody ? filterExcludeRigidBody.handle : null, this.colliders.castClosure(filterPredicate));
        return handle != null ? this.colliders.get(handle) : null;
    }
    projectPoint(point, solid, filterFlags, filterGroups, filterExcludeCollider, filterExcludeRigidBody, filterPredicate) {
        return this.broadPhase.projectPoint(this.narrowPhase, this.bodies, this.colliders, point, solid, filterFlags, filterGroups, filterExcludeCollider ? filterExcludeCollider.handle : null, filterExcludeRigidBody ? filterExcludeRigidBody.handle : null, this.colliders.castClosure(filterPredicate));
    }
    projectPointAndGetFeature(point, filterFlags, filterGroups, filterExcludeCollider, filterExcludeRigidBody, filterPredicate) {
        return this.broadPhase.projectPointAndGetFeature(this.narrowPhase, this.bodies, this.colliders, point, filterFlags, filterGroups, filterExcludeCollider ? filterExcludeCollider.handle : null, filterExcludeRigidBody ? filterExcludeRigidBody.handle : null, this.colliders.castClosure(filterPredicate));
    }
    intersectionsWithPoint(point, callback, filterFlags, filterGroups, filterExcludeCollider, filterExcludeRigidBody, filterPredicate) {
        this.broadPhase.intersectionsWithPoint(this.narrowPhase, this.bodies, this.colliders, point, this.colliders.castClosure(callback), filterFlags, filterGroups, filterExcludeCollider ? filterExcludeCollider.handle : null, filterExcludeRigidBody ? filterExcludeRigidBody.handle : null, this.colliders.castClosure(filterPredicate));
    }
    castShape(shapePos, shapeRot, shapeVel, shape, targetDistance, maxToi, stopAtPenetration, filterFlags, filterGroups, filterExcludeCollider, filterExcludeRigidBody, filterPredicate) {
        return this.broadPhase.castShape(this.narrowPhase, this.bodies, this.colliders, shapePos, shapeRot, shapeVel, shape, targetDistance, maxToi, stopAtPenetration, filterFlags, filterGroups, filterExcludeCollider ? filterExcludeCollider.handle : null, filterExcludeRigidBody ? filterExcludeRigidBody.handle : null, this.colliders.castClosure(filterPredicate));
    }
    intersectionsWithShape(shapePos, shapeRot, shape, callback, filterFlags, filterGroups, filterExcludeCollider, filterExcludeRigidBody, filterPredicate) {
        this.broadPhase.intersectionsWithShape(this.narrowPhase, this.bodies, this.colliders, shapePos, shapeRot, shape, this.colliders.castClosure(callback), filterFlags, filterGroups, filterExcludeCollider ? filterExcludeCollider.handle : null, filterExcludeRigidBody ? filterExcludeRigidBody.handle : null, this.colliders.castClosure(filterPredicate));
    }
    collidersWithAabbIntersectingAabb(aabbCenter, aabbHalfExtents, callback) {
        this.broadPhase.collidersWithAabbIntersectingAabb(this.narrowPhase, this.bodies, this.colliders, aabbCenter, aabbHalfExtents, this.colliders.castClosure(callback));
    }
    contactPairsWith(collider1, f) {
        this.narrowPhase.contactPairsWith(collider1.handle, this.colliders.castClosure(f));
    }
    intersectionPairsWith(collider1, f) {
        this.narrowPhase.intersectionPairsWith(collider1.handle, this.colliders.castClosure(f));
    }
    contactPair(collider1, collider2, f) {
        this.narrowPhase.contactPair(collider1.handle, collider2.handle, f);
    }
    intersectionPair(collider1, collider2) {
        return this.narrowPhase.intersectionPair(collider1.handle, collider2.handle);
    }
    set profilerEnabled(enabled) {
        this.physicsPipeline.raw.set_profiler_enabled(enabled);
    }
    get profilerEnabled() {
        return this.physicsPipeline.raw.is_profiler_enabled();
    }
    timingStep() {
        return this.physicsPipeline.raw.timing_step();
    }
    timingCollisionDetection() {
        return this.physicsPipeline.raw.timing_collision_detection();
    }
    timingBroadPhase() {
        return this.physicsPipeline.raw.timing_broad_phase();
    }
    timingNarrowPhase() {
        return this.physicsPipeline.raw.timing_narrow_phase();
    }
    timingSolver() {
        return this.physicsPipeline.raw.timing_solver();
    }
    timingVelocityAssembly() {
        return this.physicsPipeline.raw.timing_velocity_assembly();
    }
    timingVelocityResolution() {
        return this.physicsPipeline.raw.timing_velocity_resolution();
    }
    timingVelocityUpdate() {
        return this.physicsPipeline.raw.timing_velocity_update();
    }
    timingVelocityWriteback() {
        return this.physicsPipeline.raw.timing_velocity_writeback();
    }
    timingCcd() {
        return this.physicsPipeline.raw.timing_ccd();
    }
    timingCcdToiComputation() {
        return this.physicsPipeline.raw.timing_ccd_toi_computation();
    }
    timingCcdBroadPhase() {
        return this.physicsPipeline.raw.timing_ccd_broad_phase();
    }
    timingCcdNarrowPhase() {
        return this.physicsPipeline.raw.timing_ccd_narrow_phase();
    }
    timingCcdSolver() {
        return this.physicsPipeline.raw.timing_ccd_solver();
    }
    timingIslandConstruction() {
        return this.physicsPipeline.raw.timing_island_construction();
    }
    timingUserChanges() {
        return this.physicsPipeline.raw.timing_user_changes();
    }
}
