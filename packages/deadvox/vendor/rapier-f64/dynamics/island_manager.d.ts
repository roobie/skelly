import { RawIslandManager } from "../raw";
import { RigidBodyHandle } from "./rigid_body";
export declare class IslandManager {
    raw: RawIslandManager;
    free(): void;
    constructor(raw?: RawIslandManager);
    forEachActiveRigidBodyHandle(f: (handle: RigidBodyHandle) => void): void;
}
