import { RawRigidBodySet } from "../raw";
import { RigidBody, RigidBodyDesc, RigidBodyHandle } from "./rigid_body";
import { ColliderSet } from "../geometry";
import { ImpulseJointSet } from "./impulse_joint_set";
import { MultibodyJointSet } from "./multibody_joint_set";
import { IslandManager } from "./island_manager";
import { SoftBodySet } from "./soft_body_set";
export declare class RigidBodySet {
    raw: RawRigidBodySet;
    private map;
    free(): void;
    constructor(raw?: RawRigidBodySet);
    finalizeDeserialization(colliderSet: ColliderSet): void;
    createRigidBody(colliderSet: ColliderSet, desc: RigidBodyDesc): RigidBody;
    remove(handle: RigidBodyHandle, islands: IslandManager, colliders: ColliderSet, softBodies: SoftBodySet, impulseJoints: ImpulseJointSet, multibodyJoints: MultibodyJointSet): void;
    mapNewBodies(colliders: ColliderSet): void;
    unmapRemovedBodies(): void;
    len(): number;
    contains(handle: RigidBodyHandle): boolean;
    get(handle: RigidBodyHandle): RigidBody | null;
    forEach(f: (body: RigidBody) => void): void;
    forEachActiveRigidBody(islands: IslandManager, f: (body: RigidBody) => void): void;
    getAll(): RigidBody[];
}
