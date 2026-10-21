import { RawNarrowPhase, RawContactManifold } from "../raw";
import { ColliderHandle } from "./collider";
import { Vector } from "../math";
export declare class NarrowPhase {
    raw: RawNarrowPhase;
    tempManifold: TempContactManifold;
    free(): void;
    constructor(raw?: RawNarrowPhase);
    contactPairsWith(collider1: ColliderHandle, f: (collider2: ColliderHandle) => void): void;
    intersectionPairsWith(collider1: ColliderHandle, f: (collider2: ColliderHandle) => void): void;
    contactPair(collider1: ColliderHandle, collider2: ColliderHandle, f: (manifold: TempContactManifold, flipped: boolean) => void): void;
    intersectionPair(collider1: ColliderHandle, collider2: ColliderHandle): boolean;
}
export declare class TempContactManifold {
    raw: RawContactManifold;
    free(): void;
    constructor(raw: RawContactManifold);
    normal(): Vector;
    localNormal1(): Vector;
    localNormal2(): Vector;
    subshape1(): number;
    subshape2(): number;
    numContacts(): number;
    localContactPoint1(i: number): Vector | null;
    localContactPoint2(i: number): Vector | null;
    contactDist(i: number): number;
    contactFid1(i: number): number;
    contactFid2(i: number): number;
    contactImpulse(i: number): number;
    contactTangentImpulseX(i: number): number;
    contactTangentImpulseY(i: number): number;
    numSolverContacts(): number;
    solverContactPoint(i: number): Vector;
    solverContactDist(i: number): number;
    solverContactFriction(i: number): number;
    solverContactRestitution(i: number): number;
    solverContactTangentVelocity(i: number): Vector;
}
