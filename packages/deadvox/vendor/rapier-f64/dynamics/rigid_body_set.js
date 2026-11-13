import { RawRigidBodySet } from "../raw";
import { Coarena } from "../coarena";
import { VectorOps, RotationOps } from "../math";
import { RigidBody, } from "./rigid_body";
export class RigidBodySet {
    free() {
        if (!!this.raw) {
            this.raw.free();
        }
        this.raw = undefined;
        if (!!this.map) {
            this.map.clear();
        }
        this.map = undefined;
    }
    constructor(raw) {
        this.raw = raw || new RawRigidBodySet();
        this.map = new Coarena();
        if (raw) {
            raw.forEachRigidBodyHandle((handle) => {
                this.map.set(handle, new RigidBody(raw, null, handle));
            });
        }
    }
    finalizeDeserialization(colliderSet) {
        this.map.forEach((rb) => rb.finalizeDeserialization(colliderSet));
    }
    createRigidBody(colliderSet, desc) {
        let rawTra = VectorOps.intoRaw(desc.translation);
        let rawRot = RotationOps.intoRaw(desc.rotation);
        let rawLv = VectorOps.intoRaw(desc.linvel);
        let rawCom = VectorOps.intoRaw(desc.centerOfMass);
        let rawAv = VectorOps.intoRaw(desc.angvel);
        let rawPrincipalInertia = VectorOps.intoRaw(desc.principalAngularInertia);
        let rawInertiaFrame = RotationOps.intoRaw(desc.angularInertiaLocalFrame);
        let handle = this.raw.createRigidBody(desc.enabled, rawTra, rawRot, desc.gravityScale, desc.mass, desc.massOnly, rawCom, rawLv, rawAv, rawPrincipalInertia, rawInertiaFrame, desc.translationsEnabledX, desc.translationsEnabledY, desc.translationsEnabledZ, desc.rotationsEnabledX, desc.rotationsEnabledY, desc.rotationsEnabledZ, desc.linearDamping, desc.angularDamping, desc.status, desc.canSleep, desc.sleeping, desc.softCcdPrediction, desc.ccdEnabled, desc.dominanceGroup, desc.additionalSolverIterations, desc.additionalPgsIterations);
        rawTra.free();
        rawRot.free();
        rawLv.free();
        rawCom.free();
        rawAv.free();
        rawPrincipalInertia.free();
        rawInertiaFrame.free();
        const body = new RigidBody(this.raw, colliderSet, handle);
        body.userData = desc.userData;
        this.map.set(handle, body);
        return body;
    }
    remove(handle, islands, colliders, softBodies, impulseJoints, multibodyJoints) {
        for (let i = 0; i < this.raw.rbNumColliders(handle); i += 1) {
            colliders.unmap(this.raw.rbCollider(handle, i));
        }
        impulseJoints.forEachJointHandleAttachedToRigidBody(handle, (handle) => impulseJoints.unmap(handle));
        multibodyJoints.forEachJointHandleAttachedToRigidBody(handle, (handle) => multibodyJoints.unmap(handle));
        this.raw.remove(handle, islands.raw, colliders.raw, softBodies.raw, impulseJoints.raw, multibodyJoints.raw);
        this.map.delete(handle);
        colliders.unmapRemovedColliders();
    }
    mapNewBodies(colliders) {
        this.raw.forEachRigidBodyHandle((handle) => {
            if (!this.map.get(handle)) {
                this.map.set(handle, new RigidBody(this.raw, colliders, handle));
            }
        });
    }
    unmapRemovedBodies() {
        for (let body of this.map.getAll()) {
            if (!this.raw.contains(body.handle)) {
                this.map.delete(body.handle);
            }
        }
    }
    len() {
        return this.map.len();
    }
    contains(handle) {
        return this.get(handle) != null;
    }
    get(handle) {
        return this.map.get(handle);
    }
    forEach(f) {
        this.map.forEach(f);
    }
    forEachActiveRigidBody(islands, f) {
        islands.forEachActiveRigidBodyHandle((handle) => {
            f(this.get(handle));
        });
    }
    getAll() {
        return this.map.getAll();
    }
}
