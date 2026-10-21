import { RawIslandManager } from "../raw";
export class IslandManager {
    free() {
        if (!!this.raw) {
            this.raw.free();
        }
        this.raw = undefined;
    }
    constructor(raw) {
        this.raw = raw || new RawIslandManager();
    }
    forEachActiveRigidBodyHandle(f) {
        this.raw.forEachActiveRigidBodyHandle(f);
    }
}
