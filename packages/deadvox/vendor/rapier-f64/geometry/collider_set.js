import { RawColliderSet } from "../raw";
import { Coarena } from "../coarena";
import { RotationOps, VectorOps } from "../math";
import { Collider } from "./collider";
export class ColliderSet {
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
        this.raw = raw || new RawColliderSet();
        this.map = new Coarena();
        if (raw) {
            raw.forEachColliderHandle((handle) => {
                this.map.set(handle, new Collider(this, handle, null));
            });
        }
    }
    castClosure(f) {
        return (handle) => {
            if (!!f) {
                return f(this.get(handle));
            }
            else {
                return undefined;
            }
        };
    }
    finalizeDeserialization(bodies) {
        this.map.forEach((collider) => collider.finalizeDeserialization(bodies));
    }
    createCollider(bodies, desc, parentHandle) {
        let hasParent = parentHandle != undefined && parentHandle != null;
        if (hasParent && isNaN(parentHandle))
            throw Error("Cannot create a collider with a parent rigid-body handle that is not a number.");
        let rawShape = desc.shape.intoRaw();
        let rawTra = VectorOps.intoRaw(desc.translation);
        let rawRot = RotationOps.intoRaw(desc.rotation);
        let rawCom = VectorOps.intoRaw(desc.centerOfMass);
        let rawPrincipalInertia = VectorOps.intoRaw(desc.principalAngularInertia);
        let rawInertiaFrame = RotationOps.intoRaw(desc.angularInertiaLocalFrame);
        let handle = this.raw.createCollider(desc.enabled, rawShape, rawTra, rawRot, desc.massPropsMode, desc.mass, rawCom, rawPrincipalInertia, rawInertiaFrame, desc.density, desc.friction, desc.restitution, desc.frictionCombineRule, desc.restitutionCombineRule, desc.isSensor, desc.collisionGroups, desc.solverGroups, desc.activeCollisionTypes, desc.activeHooks, desc.activeEvents, desc.contactForceEventThreshold, desc.contactSkin, hasParent, hasParent ? parentHandle : 0, bodies.raw);
        rawShape.free();
        rawTra.free();
        rawRot.free();
        rawCom.free();
        rawPrincipalInertia.free();
        rawInertiaFrame.free();
        let parent = hasParent ? bodies.get(parentHandle) : null;
        let collider = new Collider(this, handle, parent, desc.shape);
        this.map.set(handle, collider);
        return collider;
    }
    remove(handle, islands, bodies, wakeUp) {
        this.raw.remove(handle, islands.raw, bodies.raw, wakeUp);
        this.unmap(handle);
    }
    unmap(handle) {
        this.map.delete(handle);
    }
    get(handle) {
        return this.map.get(handle);
    }
    len() {
        return this.map.len();
    }
    contains(handle) {
        return this.get(handle) != null;
    }
    forEach(f) {
        this.map.forEach(f);
    }
    getAll() {
        return this.map.getAll();
    }
}
