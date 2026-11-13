import { RawNarrowPhase } from "../raw";
import { VectorOps, scratchBuffer } from "../math";
export class NarrowPhase {
    free() {
        if (!!this.raw) {
            this.raw.free();
        }
        this.raw = undefined;
    }
    constructor(raw) {
        this.raw = raw || new RawNarrowPhase();
        this.tempManifold = new TempContactManifold(null);
    }
    contactPairsWith(collider1, f) {
        this.raw.contact_pairs_with(collider1, f);
    }
    intersectionPairsWith(collider1, f) {
        this.raw.intersection_pairs_with(collider1, f);
    }
    contactPair(collider1, collider2, bodies, f) {
        const rawPair = this.raw.contact_pair(collider1, collider2);
        if (!!rawPair) {
            const flipped = rawPair.collider1() != collider1;
            let i;
            for (i = 0; i < rawPair.numContactManifolds(); ++i) {
                this.tempManifold.bodies = bodies;
                this.tempManifold.raw = rawPair.contactManifold(i);
                if (!!this.tempManifold.raw) {
                    f(this.tempManifold, flipped);
                }
                this.tempManifold.free();
            }
            rawPair.free();
        }
    }
    intersectionPair(collider1, collider2) {
        return this.raw.intersection_pair(collider1, collider2);
    }
}
export class TempContactManifold {
    free() {
        if (!!this.raw) {
            this.raw.free();
        }
        this.raw = undefined;
    }
    constructor(raw, bodies) {
        this.raw = raw;
        this.bodies = bodies;
    }
    normal(target) {
        this.raw.normal(scratchBuffer);
        return VectorOps.fromBuffer(scratchBuffer, target);
    }
    localNormal1(target) {
        this.raw.local_n1(scratchBuffer);
        return VectorOps.fromBuffer(scratchBuffer, target);
    }
    localNormal2(target) {
        this.raw.local_n2(scratchBuffer);
        return VectorOps.fromBuffer(scratchBuffer, target);
    }
    subshape1() {
        return this.raw.subshape1();
    }
    subshape2() {
        return this.raw.subshape2();
    }
    numContacts() {
        return this.raw.num_contacts();
    }
    localContactPoint1(i, target) {
        const exists = this.raw.contact_local_p1(i, scratchBuffer);
        return exists ? VectorOps.fromBuffer(scratchBuffer, target) : null;
    }
    localContactPoint2(i, target) {
        const exists = this.raw.contact_local_p2(i, scratchBuffer);
        return exists ? VectorOps.fromBuffer(scratchBuffer, target) : null;
    }
    contactDist(i) {
        return this.raw.contact_dist(i);
    }
    contactFid1(i) {
        return this.raw.contact_fid1(i);
    }
    contactFid2(i) {
        return this.raw.contact_fid2(i);
    }
    contactImpulse(i) {
        return this.raw.contact_impulse(i);
    }
    contactTangentImpulseX(i) {
        return this.raw.contact_tangent_impulse_x(i);
    }
    contactTangentImpulseY(i) {
        return this.raw.contact_tangent_impulse_y(i);
    }
    numSolverContacts() {
        return this.raw.num_solver_contacts();
    }
    solverContactPoint(i, target) {
        const exists = this.raw.solver_contact_point(this.bodies.raw, i, scratchBuffer);
        return exists ? VectorOps.fromBuffer(scratchBuffer, target) : null;
    }
    solverContactDist(i) {
        return this.raw.solver_contact_dist(i);
    }
    friction() {
        return this.raw.friction();
    }
    restitution() {
        return this.raw.restitution();
    }
    solverContactTangentVelocity(i, target) {
        this.raw.solver_contact_tangent_velocity(i, scratchBuffer);
        return VectorOps.fromBuffer(scratchBuffer, target);
    }
}
