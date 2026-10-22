import { RawMultibodyJointSet } from "../raw";
import { MultibodyJoint, MultibodyJointHandle } from "./multibody_joint";
import { JointData } from "./impulse_joint";
import { RigidBodyHandle } from "./rigid_body";
export declare class MultibodyJointSet {
    raw: RawMultibodyJointSet;
    private map;
    free(): void;
    constructor(raw?: RawMultibodyJointSet);
    createJoint(desc: JointData, parent1: RigidBodyHandle, parent2: RigidBodyHandle, wakeUp: boolean): MultibodyJoint;
    remove(handle: MultibodyJointHandle, wake_up: boolean): void;
    unmap(handle: MultibodyJointHandle): void;
    len(): number;
    contains(handle: MultibodyJointHandle): boolean;
    get(handle: MultibodyJointHandle): MultibodyJoint | null;
    forEach(f: (joint: MultibodyJoint) => void): void;
    forEachJointHandleAttachedToRigidBody(handle: RigidBodyHandle, f: (handle: MultibodyJointHandle) => void): void;
    getAll(): MultibodyJoint[];
}
