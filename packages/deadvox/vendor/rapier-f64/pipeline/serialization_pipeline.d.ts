import { RawSerializationPipeline } from "../raw";
import { Vector } from "../math";
import { IntegrationParameters, IslandManager, ImpulseJointSet, MultibodyJointSet, RigidBodySet } from "../dynamics";
import { BroadPhase, ColliderSet, NarrowPhase } from "../geometry";
import { World } from "./world";
export declare class SerializationPipeline {
    raw: RawSerializationPipeline;
    free(): void;
    constructor(raw?: RawSerializationPipeline);
    serializeAll(gravity: Vector, integrationParameters: IntegrationParameters, islands: IslandManager, broadPhase: BroadPhase, narrowPhase: NarrowPhase, bodies: RigidBodySet, colliders: ColliderSet, impulseJoints: ImpulseJointSet, multibodyJoints: MultibodyJointSet): Uint8Array;
    deserializeAll(data: Uint8Array): World;
}
