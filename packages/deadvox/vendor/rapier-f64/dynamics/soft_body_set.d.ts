import { RawSoftBodySet } from "../raw";
import { Vector } from "../math";
import { SoftBody, SoftBodyDesc, SoftBodyHandle, SoftBodyTearEvent } from "./soft_body";
import { RigidBodySet } from "./rigid_body_set";
import { ColliderSet } from "../geometry";
import { ImpulseJointSet } from "./impulse_joint_set";
import { MultibodyJointSet } from "./multibody_joint_set";
import { IslandManager } from "./island_manager";
export declare class SoftBodySet {
    raw: RawSoftBodySet;
    private map;
    free(): void;
    constructor(raw?: RawSoftBodySet);
    finalizeDeserialization(bodies: RigidBodySet, colliders: ColliderSet): void;
    createSoftBody(bodies: RigidBodySet, colliders: ColliderSet, desc: SoftBodyDesc): SoftBody;
    remove(handle: SoftBodyHandle, islands: IslandManager, bodies: RigidBodySet, colliders: ColliderSet, impulseJoints: ImpulseJointSet, multibodyJoints: MultibodyJointSet): void;
    addCluster(handle: SoftBodyHandle, particles: Uint32Array | number[], bodies: RigidBodySet, colliders: ColliderSet): number | null;
    removeCluster(handle: SoftBodyHandle, cluster: number, islands: IslandManager, bodies: RigidBodySet, colliders: ColliderSet, impulseJoints: ImpulseJointSet, multibodyJoints: MultibodyJointSet): boolean;
    tear(handle: SoftBodyHandle, edges: Uint32Array | number[], cells: Uint32Array | number[], islands: IslandManager, bodies: RigidBodySet, colliders: ColliderSet, impulseJoints: ImpulseJointSet, multibodyJoints: MultibodyJointSet): SoftBodyTearEvent | null;
    cut(handle: SoftBodyHandle, blade: Vector[], islands: IslandManager, bodies: RigidBodySet, colliders: ColliderSet, impulseJoints: ImpulseJointSet, multibodyJoints: MultibodyJointSet): SoftBodyTearEvent | null;
    private finishTopologyChange;
    mapNewSoftBodies(bodies: RigidBodySet, colliders: ColliderSet): void;
    wakeUp(handle: SoftBodyHandle, bodies: RigidBodySet, strong: boolean): void;
    len(): number;
    contains(handle: SoftBodyHandle): boolean;
    get(handle: SoftBodyHandle): SoftBody | null;
    forEach(f: (body: SoftBody) => void): void;
    getAll(): SoftBody[];
}
