import { RawSoftBodyBuilder, RawSoftBodyMaterial, RawSoftBodySet, RawSoftBodyTearEvent, RawSoftMeshBindingMode, RawSoftRecoverySettings } from "../raw";
import { Rotation, Vector } from "../math";
import { RigidBody, RigidBodyHandle } from "./rigid_body";
import { RigidBodySet } from "./rigid_body_set";
import { Collider, ColliderDesc, ColliderSet } from "../geometry";
export type SoftBodyHandle = number;
export declare enum SoftBodyCellModel {
    Volume = 0,
    Corotational = 1,
    NeoHookean = 2
}
export declare enum SoftEdgePlasticFlow {
    Both = 0,
    Compression = 1,
    Tension = 2
}
export declare enum SoftBodySolver {
    Constraints = 0,
    Fem = 1
}
export declare enum SoftPatchConstraints {
    Keep = 0,
    StandDown = 1,
    AlongNormal = 2
}
export declare class SoftRecoverySettings {
    authoredVelocityMargin: boolean;
    edgeSpeculation: boolean;
    invertedCellDetection: boolean;
    selfCrossingDetection: boolean;
    detectionMotionGating: boolean;
    crossBodyDetection: boolean;
    selfStandDown: boolean;
    crossBodyExpelGate: boolean;
    edgeStandDown: boolean;
    crossingRepulsion: boolean;
    crossingRepulsionGuide: boolean;
    crossingRepulsionSelfGuide: boolean;
    overlapConstraints: boolean;
    overlapRigid: boolean;
    overlapSkipSelfTangled: boolean;
    overlapEdgeStandDown: boolean;
    overlapSkinVolume: boolean;
    overlapSelfRegions: boolean;
    overlapNormalPush: boolean;
    overlapMultiVolume: boolean;
    recoveryPace: number;
    overlapConstraintPace: number;
    overlapKeptDepth: number;
    overlapProgressMargin: number;
    overlapSplit: number;
    overlapPatience: number;
    overlapPatchConstraints: SoftPatchConstraints;
    constructor();
    static fromRaw(raw: RawSoftRecoverySettings): SoftRecoverySettings;
    private static copyFromRaw;
    intoRaw(): RawSoftRecoverySettings;
}
export declare enum SoftMeshBindingMode {
    Direct = 0,
    DirectByPosition = 1,
    Skinned = 2
}
export declare class SoftMeshBinding {
    mode: SoftMeshBindingMode;
    particles: Uint32Array;
    eps: number;
    selfContacts: boolean;
    constructor(mode: SoftMeshBindingMode);
    static direct(particles: Uint32Array | number[]): SoftMeshBinding;
    static directByPosition(eps: number): SoftMeshBinding;
    static skinned(): SoftMeshBinding;
    setSelfContacts(enabled: boolean): SoftMeshBinding;
    rawMode(): RawSoftMeshBindingMode;
}
export interface SpringCoefficients {
    naturalFrequency: number;
    dampingRatio: number;
}
export declare class SoftBodyMaterial {
    edgeSoftness: SpringCoefficients;
    bendSoftness: SpringCoefficients;
    volumeSoftness: SpringCoefficients;
    shapeMatchingSoftness: SpringCoefficients;
    youngModulus: number;
    poissonRatio: number;
    elasticDampingRatio: number;
    plasticYield: number;
    plasticCreep: number;
    plasticMax: number;
    deformationDamping: number;
    edgePlasticYield: number;
    edgePlasticCreep: number;
    edgePlasticMax: number;
    edgePlasticFlow: SoftEdgePlasticFlow;
    tearStrain: number | null;
    tearForce: number | null;
    tearSmoothing: number;
    interiorStrength: number;
    maxTearsPerStep: number;
    minPiece: number | null;
    constructor();
    static uniform(naturalFrequency: number, dampingRatio: number): SoftBodyMaterial;
    static fromRaw(raw: RawSoftBodyMaterial): SoftBodyMaterial;
    private static copyFromRaw;
    intoRaw(): RawSoftBodyMaterial;
}
export declare class SoftBody {
    private rawSet;
    private bodies;
    private colliders;
    readonly handle: SoftBodyHandle;
    userData?: unknown;
    constructor(rawSet: RawSoftBodySet, bodies: RigidBodySet, colliders: ColliderSet, handle: SoftBodyHandle);
    finalizeDeserialization(bodies: RigidBodySet, colliders: ColliderSet): void;
    isValid(): boolean;
    topologyVersion(): number;
    numParticles(): number;
    particlePosition(i: number, target?: Vector): Vector;
    particlePositions(): Float64Array;
    particleVelocity(i: number, target?: Vector): Vector;
    particleVelocities(): Float64Array;
    particleRestPosition(i: number, target?: Vector): Vector;
    particleMass(i: number): number;
    isParticlePinned(i: number): boolean;
    isParticleOnSurface(i: number): boolean;
    isParticleDamaged(i: number): boolean;
    setParticlePosition(i: number, position: Vector): void;
    setParticleVelocity(i: number, velocity: Vector): void;
    setParticleKinematicTarget(i: number, position: Vector): void;
    setParticlePinned(i: number, pinned: boolean): void;
    attachParticle(i: number, body: RigidBody): void;
    detachParticle(i: number): boolean;
    numAttachments(): number;
    attachmentParticle(i: number): number;
    attachmentBody(i: number): RigidBody;
    numEdges(): number;
    edges(): Uint32Array;
    edgeRestLength(i: number): number;
    isEdgeBend(i: number): boolean;
    edgeImpulse(i: number): number;
    edgeStress(i: number): number;
    edgePlasticStrain(i: number): number;
    edgeTearResistance(i: number): number;
    numCells(): number;
    cells(): Uint32Array;
    cellRestVolume(i: number): number;
    cellStress(i: number): number;
    cellStiffnessScale(i: number): number;
    cellTearResistance(i: number): number;
    numDihedrals(): number;
    dihedrals(): Uint32Array;
    dihedralRestAngle(i: number): number;
    boundary(): Uint32Array;
    material(): SoftBodyMaterial;
    setMaterial(material: SoftBodyMaterial): void;
    cellModel(): SoftBodyCellModel;
    solver(): SoftBodySolver;
    setSolver(solver: SoftBodySolver): void;
    volumePreservationEnabled(): boolean;
    enableVolumePreservation(enabled: boolean): void;
    restVolume(): number;
    volume(): number;
    volumeFactor(): number;
    setVolumeFactor(factor: number): void;
    particleRadius(): number;
    resetPlasticity(): void;
    rootBody(): RigidBody;
    origin(): SoftBodyHandle | null;
    pieces(): SoftBodyHandle[];
    centerOfMass(target?: Vector): Vector;
    mass(): number;
    isSleeping(): boolean;
    wakeUp(): void;
    isEnabled(): boolean;
    setEnabled(enabled: boolean): void;
    setAdditionalPgsIterations(iterations: number): void;
    linearDamping(): number;
    gravityScale(): number;
    addForce(force: Vector, wakeUp: boolean): void;
    addParticleForce(i: number, force: Vector, wakeUp: boolean): void;
    resetForces(wakeUp: boolean): void;
    applyImpulse(impulse: Vector, wakeUp: boolean): void;
    applyParticleImpulse(i: number, impulse: Vector, wakeUp: boolean): void;
    applyImpulseAtPoint(impulse: Vector, point: Vector, falloffRadius: number, wakeUp: boolean): void;
    applyRadialImpulse(center: Vector, magnitude: number, falloffRadius: number, wakeUp: boolean): void;
    tearEdge(i: number): void;
    tearCell(i: number): void;
    hasPendingTears(): boolean;
    numClusters(): number;
    isClusterLive(i: number): boolean;
    clusterProxy(i: number): RigidBody | null;
    clusterParticles(i: number): Uint32Array;
    clusterShapeMatchingEnabled(i: number): boolean;
    enableClusterShapeMatching(i: number, enabled: boolean): void;
    setClusterStiffnessScale(i: number, scale: number): void;
    setClusterEdgeSoftness(i: number, softness: SpringCoefficients | null): void;
    setClusterTearResistance(i: number, resistance: number): void;
    setClusterPinned(i: number, pinned: boolean): void;
    setClusterKinematicTarget(i: number, translation: Vector, rotation: Rotation): void;
    numMeshes(): number;
    meshCluster(i: number): number | null;
    meshCollider(i: number): Collider | null;
    isMeshSkinned(i: number): boolean;
    meshCollisionEnabled(i: number): boolean;
    isMeshOriented(i: number): boolean;
    meshVertices(i: number): Float64Array;
    meshIndices(i: number): Uint32Array;
    meshOfCollider(collider: Collider): number | null;
}
export declare class SoftBodyDesc {
    private generator;
    private setters;
    material: SoftBodyMaterial | null;
    softness: SpringCoefficients | null;
    particleMass: number;
    mass: number | null;
    masses: Float64Array | null;
    pinnedParticles: Uint32Array;
    cellModel: SoftBodyCellModel;
    solver: SoftBodySolver;
    volumePreservation: boolean | null;
    volumeFactor: number;
    shapeMatching: boolean | null;
    selfContacts: boolean;
    oriented: boolean | null;
    particleRadius: number | null;
    surfaceCollider: ColliderDesc | null;
    skinCollision: boolean;
    translation: Vector | null;
    linearDamping: number;
    gravityScale: number;
    additionalSolverIterations: number;
    additionalPgsIterations: number;
    canSleep: boolean;
    dominanceGroup: number;
    userData?: unknown;
    constructor(positions?: Float64Array | number[]);
    private static withGenerator;
    static rope(start: Vector, end: Vector, numParticles: number): SoftBodyDesc;
    static volumetric(vertices: Float64Array, indices: Uint32Array, cellSize: number, skinned?: boolean): SoftBodyDesc | null;
    static trimesh(vertices: Float64Array, indices: Uint32Array): SoftBodyDesc | null;
    static cloth(origin: Vector, du: Vector, dv: Vector, nu: number, nv: number): SoftBodyDesc;
    static clothTube(origin: Vector, axis: Vector, radiusStart: number, radiusEnd: number, numAround: number, numAlong: number): SoftBodyDesc;
    static clothAnisotropic(origin: Vector, du: Vector, dv: Vector, nu: number, nv: number, warp: SpringCoefficients, weft: SpringCoefficients, shear: SpringCoefficients): SoftBodyDesc;
    static cuboid(center: Vector, halfExtents: Vector, nx: number, ny: number, nz: number): SoftBodyDesc;
    static sphere(center: Vector, radius: number, subdivisions: number): SoftBodyDesc;
    setMaterial(material: SoftBodyMaterial): SoftBodyDesc;
    setSoftness(naturalFrequency: number, dampingRatio: number): SoftBodyDesc;
    setParticleMass(mass: number): SoftBodyDesc;
    setMass(mass: number): SoftBodyDesc;
    setMasses(masses: Float64Array | number[]): SoftBodyDesc;
    setPinnedParticles(pinned: Uint32Array | number[]): SoftBodyDesc;
    setEdges(edges: Uint32Array | number[]): SoftBodyDesc;
    addEdges(edges: Uint32Array | number[]): SoftBodyDesc;
    setBendEdges(edges: Uint32Array | number[]): SoftBodyDesc;
    setTensionOnly(): SoftBodyDesc;
    setDihedrals(dihedrals: Uint32Array | number[]): SoftBodyDesc;
    setWire(segments: Uint32Array | number[]): SoftBodyDesc;
    setCells(cells: Uint32Array | number[]): SoftBodyDesc;
    setSurface(surface: Uint32Array | number[]): SoftBodyDesc;
    setSkin(vertices: Float64Array | number[], indices: Uint32Array | number[]): SoftBodyDesc;
    setSkinCollision(enabled: boolean): SoftBodyDesc;
    setEdgeSoftness(edges: Uint32Array | number[], softness: SpringCoefficients[]): SoftBodyDesc;
    setEdgeTearResistance(edges: Uint32Array | number[], resistances: Float64Array | number[]): SoftBodyDesc;
    setCellModel(model: SoftBodyCellModel): SoftBodyDesc;
    setSolver(solver: SoftBodySolver): SoftBodyDesc;
    setVolumePreservation(enabled: boolean): SoftBodyDesc;
    setVolumeFactor(factor: number): SoftBodyDesc;
    setShapeMatching(enabled: boolean): SoftBodyDesc;
    setSelfContacts(enabled: boolean): SoftBodyDesc;
    setOriented(oriented: boolean): SoftBodyDesc;
    setParticleRadius(radius: number): SoftBodyDesc;
    setSurfaceCollider(collider: ColliderDesc): SoftBodyDesc;
    setNoSurfaceCollider(): SoftBodyDesc;
    setTranslation(translation: Vector): SoftBodyDesc;
    setLinearDamping(damping: number): SoftBodyDesc;
    setGravityScale(scale: number): SoftBodyDesc;
    setAdditionalSolverIterations(iterations: number): SoftBodyDesc;
    setAdditionalPgsIterations(iterations: number): SoftBodyDesc;
    setCanSleep(canSleep: boolean): SoftBodyDesc;
    setDominanceGroup(group: number): SoftBodyDesc;
    setUserData(data: unknown): SoftBodyDesc;
    append(other: SoftBodyDesc): SoftBodyDesc;
    intoRaw(): RawSoftBodyBuilder;
    numParticles(): number;
    particlePositions(): Float64Array;
}
export declare class SoftBodyTearEvent {
    raw: RawSoftBodyTearEvent;
    constructor(raw?: RawSoftBodyTearEvent);
    free(): void;
    softBody(): SoftBodyHandle;
    tornEdges(): Uint32Array;
    tornCells(): Uint32Array;
    removedEdges(): Uint32Array;
    splitParticles(): Uint32Array;
    insertedParticles(): Uint32Array;
    seeds(): Uint32Array;
    numPieces(): number;
    pieceSoftBody(i: number): SoftBodyHandle;
    pieceParticles(i: number): Uint32Array;
    pieceClusters(i: number): Uint32Array;
    numClusterSplits(): number;
    clusterSplitSource(i: number): number;
    clusterSplitSoftBody(i: number): SoftBodyHandle;
    clusterSplitCluster(i: number): number;
    clusterSplitProxy(i: number): RigidBodyHandle;
    clusterSplitKeepsProxy(i: number): boolean;
    numMovedJoints(): number;
    movedJoint(i: number): number;
    movedJointFrom(i: number): RigidBodyHandle;
    movedJointTo(i: number): RigidBodyHandle;
    particleDestination(particle: number): {
        softBody: SoftBodyHandle;
        particle: number;
    } | null;
}
