import { Rotation, Vector } from "../math";
import { RawGenericJoint, RawImpulseJointSet, RawJointAxis } from "../raw";
import { RigidBody } from "./rigid_body";
import { RigidBodySet } from "./rigid_body_set";
export type ImpulseJointHandle = number;
export declare enum JointType {
    Revolute = 0,
    Fixed = 1,
    Prismatic = 2,
    Rope = 3,
    Spring = 4,
    Spherical = 5,
    Generic = 6
}
export declare enum MotorModel {
    AccelerationBased = 0,
    ForceBased = 1
}
export declare enum JointAxesMask {
    LinX = 1,
    LinY = 2,
    LinZ = 4,
    AngX = 8,
    AngY = 16,
    AngZ = 32
}
export declare class ImpulseJoint {
    protected rawSet: RawImpulseJointSet;
    protected bodySet: RigidBodySet;
    handle: ImpulseJointHandle;
    constructor(rawSet: RawImpulseJointSet, bodySet: RigidBodySet, handle: ImpulseJointHandle);
    static newTyped(rawSet: RawImpulseJointSet, bodySet: RigidBodySet, handle: ImpulseJointHandle): ImpulseJoint;
    finalizeDeserialization(bodySet: RigidBodySet): void;
    isValid(): boolean;
    body1(): RigidBody;
    body2(): RigidBody;
    type(): JointType;
    frameX1(): Rotation;
    frameX2(): Rotation;
    anchor1(): Vector;
    anchor2(): Vector;
    setAnchor1(newPos: Vector): void;
    setAnchor2(newPos: Vector): void;
    setContactsEnabled(enabled: boolean): void;
    contactsEnabled(): boolean;
}
export declare class UnitImpulseJoint extends ImpulseJoint {
    protected rawAxis?(): RawJointAxis;
    limitsEnabled(): boolean;
    limitsMin(): number;
    limitsMax(): number;
    setLimits(min: number, max: number): void;
    configureMotorModel(model: MotorModel): void;
    configureMotorVelocity(targetVel: number, factor: number): void;
    configureMotorPosition(targetPos: number, stiffness: number, damping: number): void;
    configureMotor(targetPos: number, targetVel: number, stiffness: number, damping: number): void;
}
export declare class FixedImpulseJoint extends ImpulseJoint {
}
export declare class RopeImpulseJoint extends ImpulseJoint {
}
export declare class SpringImpulseJoint extends ImpulseJoint {
}
export declare class PrismaticImpulseJoint extends UnitImpulseJoint {
    rawAxis(): RawJointAxis;
}
export declare class RevoluteImpulseJoint extends UnitImpulseJoint {
    rawAxis(): RawJointAxis;
}
export declare class GenericImpulseJoint extends ImpulseJoint {
}
export declare class SphericalImpulseJoint extends ImpulseJoint {
}
export declare class JointData {
    anchor1: Vector;
    anchor2: Vector;
    axis: Vector;
    frame1: Rotation;
    frame2: Rotation;
    jointType: JointType;
    limitsEnabled: boolean;
    limits: Array<number>;
    axesMask: JointAxesMask;
    stiffness: number;
    damping: number;
    length: number;
    private constructor();
    static fixed(anchor1: Vector, frame1: Rotation, anchor2: Vector, frame2: Rotation): JointData;
    static spring(rest_length: number, stiffness: number, damping: number, anchor1: Vector, anchor2: Vector): JointData;
    static rope(length: number, anchor1: Vector, anchor2: Vector): JointData;
    static generic(anchor1: Vector, anchor2: Vector, axis: Vector, axesMask: JointAxesMask): JointData;
    static spherical(anchor1: Vector, anchor2: Vector): JointData;
    static prismatic(anchor1: Vector, anchor2: Vector, axis: Vector): JointData;
    static revolute(anchor1: Vector, anchor2: Vector, axis: Vector): JointData;
    intoRaw(): RawGenericJoint;
}
