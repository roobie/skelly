import { RawSerializationPipeline } from "../raw";
import { VectorOps } from "../math";
import { World } from "./world";
export class SerializationPipeline {
    free() {
        if (!!this.raw) {
            this.raw.free();
        }
        this.raw = undefined;
    }
    constructor(raw) {
        this.raw = raw || new RawSerializationPipeline();
    }
    serializeAll(gravity, integrationParameters, islands, broadPhase, narrowPhase, bodies, colliders, softBodies, impulseJoints, multibodyJoints) {
        let rawGra = VectorOps.intoRaw(gravity);
        const res = this.raw.serializeAll(rawGra, integrationParameters.raw, islands.raw, broadPhase.raw, narrowPhase.raw, bodies.raw, colliders.raw, softBodies.raw, impulseJoints.raw, multibodyJoints.raw);
        rawGra.free();
        return res;
    }
    deserializeAll(data) {
        return World.fromRaw(this.raw.deserializeAll(data));
    }
}
