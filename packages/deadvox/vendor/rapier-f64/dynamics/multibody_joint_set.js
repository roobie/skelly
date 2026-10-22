import { RawMultibodyJointSet } from "../raw";
import { Coarena } from "../coarena";
import { MultibodyJoint, } from "./multibody_joint";
export class MultibodyJointSet {
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
        this.raw = raw || new RawMultibodyJointSet();
        this.map = new Coarena();
        if (raw) {
            raw.forEachJointHandle((handle) => {
                this.map.set(handle, MultibodyJoint.newTyped(this.raw, handle));
            });
        }
    }
    createJoint(desc, parent1, parent2, wakeUp) {
        const rawParams = desc.intoRaw();
        const handle = this.raw.createJoint(rawParams, parent1, parent2, wakeUp);
        rawParams.free();
        let joint = MultibodyJoint.newTyped(this.raw, handle);
        this.map.set(handle, joint);
        return joint;
    }
    remove(handle, wake_up) {
        this.raw.remove(handle, wake_up);
        this.map.delete(handle);
    }
    unmap(handle) {
        this.map.delete(handle);
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
    forEachJointHandleAttachedToRigidBody(handle, f) {
        this.raw.forEachJointAttachedToRigidBody(handle, f);
    }
    getAll() {
        return this.map.getAll();
    }
}
