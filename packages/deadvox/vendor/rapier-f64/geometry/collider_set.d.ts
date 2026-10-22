import { RawColliderSet } from "../raw";
import { Collider, ColliderDesc, ColliderHandle } from "./collider";
import { ImpulseJointHandle, IslandManager, RigidBodyHandle } from "../dynamics";
import { RigidBodySet } from "../dynamics";
export declare class ColliderSet {
    raw: RawColliderSet;
    private map;
    free(): void;
    constructor(raw?: RawColliderSet);
    castClosure<Res>(f?: (collider: Collider) => Res): (handle: ColliderHandle) => Res | undefined;
    finalizeDeserialization(bodies: RigidBodySet): void;
    createCollider(bodies: RigidBodySet, desc: ColliderDesc, parentHandle: RigidBodyHandle): Collider;
    remove(handle: ColliderHandle, islands: IslandManager, bodies: RigidBodySet, wakeUp: boolean): void;
    unmap(handle: ImpulseJointHandle): void;
    get(handle: ColliderHandle): Collider | null;
    len(): number;
    contains(handle: ColliderHandle): boolean;
    forEach(f: (collider: Collider) => void): void;
    getAll(): Collider[];
}
