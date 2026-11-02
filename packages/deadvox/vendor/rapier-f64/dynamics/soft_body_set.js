import { RawSoftBodySet } from "../raw";
import { Coarena } from "../coarena";
import { SoftBody, SoftBodyTearEvent, } from "./soft_body";
export class SoftBodySet {
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
        this.raw = raw || new RawSoftBodySet();
        this.map = new Coarena();
        if (raw) {
            raw.forEachSoftBodyHandle((handle) => {
                this.map.set(handle, new SoftBody(raw, null, null, handle));
            });
        }
    }
    finalizeDeserialization(bodies, colliders) {
        this.map.forEach((sb) => sb.finalizeDeserialization(bodies, colliders));
    }
    createSoftBody(bodies, colliders, desc) {
        let rawBuilder = desc.intoRaw();
        let handle = this.raw.insert(rawBuilder, bodies.raw, colliders.raw);
        rawBuilder.free();
        bodies.mapNewBodies(colliders);
        colliders.mapNewColliders(bodies);
        const body = new SoftBody(this.raw, bodies, colliders, handle);
        body.userData = desc.userData;
        this.map.set(handle, body);
        return body;
    }
    remove(handle, islands, bodies, colliders, impulseJoints, multibodyJoints) {
        this.raw.remove(handle, islands.raw, bodies.raw, colliders.raw, impulseJoints.raw, multibodyJoints.raw);
        this.map.delete(handle);
        bodies.unmapRemovedBodies();
        colliders.unmapRemovedColliders();
        impulseJoints.unmapRemovedJoints();
        multibodyJoints.unmapRemovedJoints();
    }
    addCluster(handle, particles, bodies, colliders) {
        let cluster = this.raw.addCluster(handle, Uint32Array.from(particles), bodies.raw, colliders.raw);
        bodies.mapNewBodies(colliders);
        return cluster === undefined ? null : cluster;
    }
    removeCluster(handle, cluster, islands, bodies, colliders, impulseJoints, multibodyJoints) {
        let removed = this.raw.removeCluster(handle, cluster, islands.raw, bodies.raw, colliders.raw, impulseJoints.raw, multibodyJoints.raw);
        bodies.unmapRemovedBodies();
        colliders.unmapRemovedColliders();
        impulseJoints.unmapRemovedJoints();
        multibodyJoints.unmapRemovedJoints();
        return removed;
    }
    tear(handle, edges, cells, islands, bodies, colliders, impulseJoints, multibodyJoints) {
        let raw = this.raw.tear(handle, Uint32Array.from(edges), Uint32Array.from(cells), islands.raw, bodies.raw, colliders.raw, impulseJoints.raw, multibodyJoints.raw);
        return this.finishTopologyChange(raw, bodies, colliders, impulseJoints, multibodyJoints);
    }
    cut(handle, blade, islands, bodies, colliders, impulseJoints, multibodyJoints) {
        let flat = [];
        for (let point of blade) {
            flat.push(point.x, point.y);
            flat.push(point.z);
        }
        let raw = this.raw.cut(handle, Float64Array.from(flat), islands.raw, bodies.raw, colliders.raw, impulseJoints.raw, multibodyJoints.raw);
        return this.finishTopologyChange(raw, bodies, colliders, impulseJoints, multibodyJoints);
    }
    finishTopologyChange(raw, bodies, colliders, impulseJoints, multibodyJoints) {
        if (!raw) {
            return null;
        }
        this.mapNewSoftBodies(bodies, colliders);
        bodies.mapNewBodies(colliders);
        colliders.mapNewColliders(bodies);
        bodies.unmapRemovedBodies();
        colliders.unmapRemovedColliders();
        impulseJoints.unmapRemovedJoints();
        multibodyJoints.unmapRemovedJoints();
        return new SoftBodyTearEvent(raw);
    }
    mapNewSoftBodies(bodies, colliders) {
        this.raw.forEachSoftBodyHandle((handle) => {
            if (!this.map.get(handle)) {
                this.map.set(handle, new SoftBody(this.raw, bodies, colliders, handle));
            }
        });
    }
    wakeUp(handle, bodies, strong) {
        this.raw.wakeUp(handle, bodies.raw, strong);
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
