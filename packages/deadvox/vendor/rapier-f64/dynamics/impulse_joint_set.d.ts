import { RawImpulseJointSet } from "../raw";
import { RigidBodySet } from "./rigid_body_set";
import { ImpulseJoint, ImpulseJointHandle, JointData } from "./impulse_joint";
import { RigidBodyHandle } from "./rigid_body";
export declare class ImpulseJointSet {
    raw: RawImpulseJointSet;
    private map;
    free(): void;
    constructor(raw?: RawImpulseJointSet);
    finalizeDeserialization(bodies: RigidBodySet): void;
    createJoint(bodies: RigidBodySet, desc: JointData, parent1: RigidBodyHandle, parent2: RigidBodyHandle, wakeUp: boolean): ImpulseJoint;
    remove(handle: ImpulseJointHandle, wakeUp: boolean): void;
    forEachJointHandleAttachedToRigidBody(handle: RigidBodyHandle, f: (handle: ImpulseJointHandle) => void): void;
    unmap(handle: ImpulseJointHandle): void;
    unmapRemovedJoints(): void;
    len(): number;
    contains(handle: ImpulseJointHandle): boolean;
    get(handle: ImpulseJointHandle): ImpulseJoint | null;
    forEach(f: (joint: ImpulseJoint) => void): void;
    getAll(): ImpulseJoint[];
}
