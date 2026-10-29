import { VectorOps, scratchBuffer } from "../math";
export class ShapeContact {
    constructor(dist, point1, point2, normal1, normal2) {
        this.distance = dist;
        this.point1 = point1;
        this.point2 = point2;
        this.normal1 = normal1;
        this.normal2 = normal2;
    }
    static fromBuffer(raw, target) {
        if (!raw)
            return null;
        raw.getComponents(scratchBuffer);
        raw.free();
        target ?? (target = new ShapeContact(0, VectorOps.zeros(), VectorOps.zeros(), VectorOps.zeros(), VectorOps.zeros()));
        target.distance = scratchBuffer[0];
        target.point1.x = scratchBuffer[1];
        target.point1.y = scratchBuffer[2];
        target.point1.z = scratchBuffer[3];
        target.point2.x = scratchBuffer[4];
        target.point2.y = scratchBuffer[5];
        target.point2.z = scratchBuffer[6];
        target.normal1.x = scratchBuffer[7];
        target.normal1.y = scratchBuffer[8];
        target.normal1.z = scratchBuffer[9];
        target.normal2.x = scratchBuffer[10];
        target.normal2.y = scratchBuffer[11];
        target.normal2.z = scratchBuffer[12];
        return target;
    }
}
