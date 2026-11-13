import { RawSerializationPipeline } from "../raw";
import { Vector } from "../math";
import { IntegrationParameters, IslandManager, ImpulseJointSet, MultibodyJointSet, RigidBodySet, SoftBodySet } from "../dynamics";
import { BroadPhase, ColliderSet, NarrowPhase } from "../geometry";
import { World } from "./world";
export declare class SerializationPipeline {
    raw: RawSerializationPipeline;
    free(): void;
    constructor(raw?: RawSerializationPipeline);
    serializeAll(gravity: Vector, integrationParameters: IntegrationParameters, islands: IslandManager, broadPhase: BroadPhase, narrowPhase: NarrowPhase, bodies: RigidBodySet, colliders: ColliderSet, softBodies: SoftBodySet, impulseJoints: ImpulseJointSet, multibodyJoints: MultibodyJointSet): Uint8Array;
    deserializeAll(data: Uint8Array): World;
}
