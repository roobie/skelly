import { RawNarrowPhase, RawContactManifold } from "../raw";
import { ColliderHandle } from "./collider";
import { RigidBodySet } from "../dynamics";
import { Vector } from "../math";
export declare class NarrowPhase {
    raw: RawNarrowPhase;
    tempManifold: TempContactManifold;
    free(): void;
    constructor(raw?: RawNarrowPhase);
    contactPairsWith(collider1: ColliderHandle, f: (collider2: ColliderHandle) => void): void;
    intersectionPairsWith(collider1: ColliderHandle, f: (collider2: ColliderHandle) => void): void;
    contactPair(collider1: ColliderHandle, collider2: ColliderHandle, bodies: RigidBodySet, f: (manifold: TempContactManifold, flipped: boolean) => void): void;
    intersectionPair(collider1: ColliderHandle, collider2: ColliderHandle): boolean;
}
export declare class TempContactManifold {
    raw: RawContactManifold;
    bodies: RigidBodySet;
    free(): void;
    constructor(raw: RawContactManifold, bodies?: RigidBodySet);
    normal(target?: Vector): Vector;
    localNormal1(target?: Vector): Vector;
    localNormal2(target?: Vector): Vector;
    subshape1(): number;
    subshape2(): number;
    numContacts(): number;
    localContactPoint1(i: number, target?: Vector): Vector | null;
    localContactPoint2(i: number, target?: Vector): Vector | null;
    contactDist(i: number): number;
    contactFid1(i: number): number;
    contactFid2(i: number): number;
    contactImpulse(i: number): number;
    contactTangentImpulseX(i: number): number;
    contactTangentImpulseY(i: number): number;
    numSolverContacts(): number;
    solverContactPoint(i: number, target?: Vector): Vector | null;
    solverContactDist(i: number): number;
    friction(): number;
    restitution(): number;
    solverContactTangentVelocity(i: number, target?: Vector): Vector;
}
