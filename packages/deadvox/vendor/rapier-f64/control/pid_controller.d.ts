import { Rotation, Vector } from "../math";
import { IntegrationParameters, RigidBody, RigidBodySet } from "../dynamics";
export declare enum PidAxesMask {
    None = 0,
    LinX = 1,
    LinY = 2,
    LinZ = 4,
    AngX = 8,
    AngY = 16,
    AngZ = 32,
    AllLin = 7,
    AllAng = 56,
    All = 63
}
export declare class PidController {
    private raw;
    private params;
    private bodies;
    constructor(params: IntegrationParameters, bodies: RigidBodySet, kp: number, ki: number, kd: number, axes: PidAxesMask);
    free(): void;
    setKp(kp: number, axes: PidAxesMask): void;
    setKi(ki: number, axes: PidAxesMask): void;
    setKd(kd: number, axes: PidAxesMask): void;
    setAxes(axes: PidAxesMask): void;
    resetIntegrals(): void;
    applyLinearCorrection(body: RigidBody, targetPosition: Vector, targetLinvel: Vector): void;
    applyAngularCorrection(body: RigidBody, targetRotation: Rotation, targetAngVel: Vector): void;
    linearCorrection(body: RigidBody, targetPosition: Vector, targetLinvel: Vector, target?: Vector): Vector;
    angularCorrection(body: RigidBody, targetRotation: Rotation, targetAngVel: Vector, target?: Vector): Vector;
}
