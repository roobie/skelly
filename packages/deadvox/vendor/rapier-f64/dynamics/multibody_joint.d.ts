import { RawJointAxis, RawMultibodyJointSet } from "../raw";
export type MultibodyJointHandle = number;
export declare class MultibodyJoint {
    protected rawSet: RawMultibodyJointSet;
    handle: MultibodyJointHandle;
    constructor(rawSet: RawMultibodyJointSet, handle: MultibodyJointHandle);
    static newTyped(rawSet: RawMultibodyJointSet, handle: MultibodyJointHandle): MultibodyJoint;
    isValid(): boolean;
    setContactsEnabled(enabled: boolean): void;
    contactsEnabled(): boolean;
}
export declare class UnitMultibodyJoint extends MultibodyJoint {
    protected rawAxis?(): RawJointAxis;
}
export declare class FixedMultibodyJoint extends MultibodyJoint {
}
export declare class PrismaticMultibodyJoint extends UnitMultibodyJoint {
    rawAxis(): RawJointAxis;
}
export declare class RevoluteMultibodyJoint extends UnitMultibodyJoint {
    rawAxis(): RawJointAxis;
}
export declare class SphericalMultibodyJoint extends MultibodyJoint {
}
