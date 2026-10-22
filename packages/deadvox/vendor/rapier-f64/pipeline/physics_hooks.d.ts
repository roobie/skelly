import { RigidBodyHandle } from "../dynamics";
import { ColliderHandle } from "../geometry";
export declare enum ActiveHooks {
    NONE = 0,
    FILTER_CONTACT_PAIRS = 1,
    FILTER_INTERSECTION_PAIRS = 2
}
export declare enum SolverFlags {
    EMPTY = 0,
    COMPUTE_IMPULSE = 1
}
export interface PhysicsHooks {
    filterContactPair(collider1: ColliderHandle, collider2: ColliderHandle, body1: RigidBodyHandle, body2: RigidBodyHandle): SolverFlags | null;
    filterIntersectionPair(collider1: ColliderHandle, collider2: ColliderHandle, body1: RigidBodyHandle, body2: RigidBodyHandle): boolean;
}
