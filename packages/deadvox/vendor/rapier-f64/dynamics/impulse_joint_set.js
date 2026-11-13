import { RawImpulseJointSet } from "../raw";
import { Coarena } from "../coarena";
import { ImpulseJoint, } from "./impulse_joint";
export class ImpulseJointSet {
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
        this.raw = raw || new RawImpulseJointSet();
        this.map = new Coarena();
        if (raw) {
            raw.forEachJointHandle((handle) => {
                this.map.set(handle, ImpulseJoint.newTyped(raw, null, handle));
            });
        }
    }
    finalizeDeserialization(bodies) {
        this.map.forEach((joint) => joint.finalizeDeserialization(bodies));
    }
    createJoint(bodies, desc, parent1, parent2, wakeUp) {
        const rawParams = desc.intoRaw();
        const handle = this.raw.createJoint(rawParams, parent1, parent2, wakeUp);
        rawParams.free();
        let joint = ImpulseJoint.newTyped(this.raw, bodies, handle);
        this.map.set(handle, joint);
        return joint;
    }
    remove(handle, wakeUp) {
        this.raw.remove(handle, wakeUp);
        this.unmap(handle);
    }
    forEachJointHandleAttachedToRigidBody(handle, f) {
        this.raw.forEachJointAttachedToRigidBody(handle, f);
    }
    unmap(handle) {
        this.map.delete(handle);
    }
    unmapRemovedJoints() {
        for (let joint of this.map.getAll()) {
            if (!this.raw.contains(joint.handle)) {
                this.map.delete(joint.handle);
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
    getAll() {
        return this.map.getAll();
    }
}
