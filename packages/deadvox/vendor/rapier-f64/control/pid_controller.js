import { RawPidController } from "../raw";
import { RotationOps, VectorOps } from "../math";
export var PidAxesMask;
(function (PidAxesMask) {
    PidAxesMask[PidAxesMask["None"] = 0] = "None";
    PidAxesMask[PidAxesMask["LinX"] = 1] = "LinX";
    PidAxesMask[PidAxesMask["LinY"] = 2] = "LinY";
    PidAxesMask[PidAxesMask["LinZ"] = 4] = "LinZ";
    PidAxesMask[PidAxesMask["AngX"] = 8] = "AngX";
    PidAxesMask[PidAxesMask["AngY"] = 16] = "AngY";
    PidAxesMask[PidAxesMask["AngZ"] = 32] = "AngZ";
    PidAxesMask[PidAxesMask["AllLin"] = 7] = "AllLin";
    PidAxesMask[PidAxesMask["AllAng"] = 56] = "AllAng";
    PidAxesMask[PidAxesMask["All"] = 63] = "All";
})(PidAxesMask || (PidAxesMask = {}));
export class PidController {
    constructor(params, bodies, kp, ki, kd, axes) {
        this.params = params;
        this.bodies = bodies;
        this.raw = new RawPidController(kp, ki, kd, axes);
    }
    free() {
        if (!!this.raw) {
            this.raw.free();
        }
        this.raw = undefined;
    }
    setKp(kp, axes) {
        this.raw.set_kp(kp, axes);
    }
    setKi(ki, axes) {
        this.raw.set_kp(ki, axes);
    }
    setKd(kd, axes) {
        this.raw.set_kp(kd, axes);
    }
    setAxes(axes) {
        this.raw.set_axes_mask(axes);
    }
    resetIntegrals() {
        this.raw.reset_integrals();
    }
    applyLinearCorrection(body, targetPosition, targetLinvel) {
        let rawPos = VectorOps.intoRaw(targetPosition);
        let rawVel = VectorOps.intoRaw(targetLinvel);
        this.raw.apply_linear_correction(this.params.dt, this.bodies.raw, body.handle, rawPos, rawVel);
        rawPos.free();
        rawVel.free();
    }
    applyAngularCorrection(body, targetRotation, targetAngVel) {
        let rawPos = RotationOps.intoRaw(targetRotation);
        let rawVel = VectorOps.intoRaw(targetAngVel);
        this.raw.apply_angular_correction(this.params.dt, this.bodies.raw, body.handle, rawPos, rawVel);
        rawPos.free();
        rawVel.free();
    }
    linearCorrection(body, targetPosition, targetLinvel) {
        let rawPos = VectorOps.intoRaw(targetPosition);
        let rawVel = VectorOps.intoRaw(targetLinvel);
        let correction = this.raw.linear_correction(this.params.dt, this.bodies.raw, body.handle, rawPos, rawVel);
        rawPos.free();
        rawVel.free();
        return VectorOps.fromRaw(correction);
    }
    angularCorrection(body, targetRotation, targetAngVel) {
        let rawPos = RotationOps.intoRaw(targetRotation);
        let rawVel = VectorOps.intoRaw(targetAngVel);
        let correction = this.raw.angular_correction(this.params.dt, this.bodies.raw, body.handle, rawPos, rawVel);
        rawPos.free();
        rawVel.free();
        return VectorOps.fromRaw(correction);
    }
}
