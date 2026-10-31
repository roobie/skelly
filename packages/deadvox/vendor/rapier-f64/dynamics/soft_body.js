import { RawSoftBodyBuilder, RawSoftBodyMaterial, RawSoftRecoverySettings, } from "../raw";
import { RotationOps, VectorOps, scratchBuffer } from "../math";
import { ColliderDesc } from "../geometry";
export var SoftBodyCellModel;
(function (SoftBodyCellModel) {
    SoftBodyCellModel[SoftBodyCellModel["Volume"] = 0] = "Volume";
    SoftBodyCellModel[SoftBodyCellModel["Corotational"] = 1] = "Corotational";
    SoftBodyCellModel[SoftBodyCellModel["NeoHookean"] = 2] = "NeoHookean";
})(SoftBodyCellModel || (SoftBodyCellModel = {}));
export var SoftEdgePlasticFlow;
(function (SoftEdgePlasticFlow) {
    SoftEdgePlasticFlow[SoftEdgePlasticFlow["Both"] = 0] = "Both";
    SoftEdgePlasticFlow[SoftEdgePlasticFlow["Compression"] = 1] = "Compression";
    SoftEdgePlasticFlow[SoftEdgePlasticFlow["Tension"] = 2] = "Tension";
})(SoftEdgePlasticFlow || (SoftEdgePlasticFlow = {}));
export var SoftBodySolver;
(function (SoftBodySolver) {
    SoftBodySolver[SoftBodySolver["Constraints"] = 0] = "Constraints";
    SoftBodySolver[SoftBodySolver["Fem"] = 1] = "Fem";
})(SoftBodySolver || (SoftBodySolver = {}));
export var SoftPatchConstraints;
(function (SoftPatchConstraints) {
    SoftPatchConstraints[SoftPatchConstraints["Keep"] = 0] = "Keep";
    SoftPatchConstraints[SoftPatchConstraints["StandDown"] = 1] = "StandDown";
    SoftPatchConstraints[SoftPatchConstraints["AlongNormal"] = 2] = "AlongNormal";
})(SoftPatchConstraints || (SoftPatchConstraints = {}));
export class SoftRecoverySettings {
    constructor() {
        SoftRecoverySettings.copyFromRaw(this, new RawSoftRecoverySettings(), true);
    }
    static fromRaw(raw) {
        let res = new SoftRecoverySettings();
        SoftRecoverySettings.copyFromRaw(res, raw, true);
        return res;
    }
    static copyFromRaw(target, raw, freeRaw) {
        target.authoredVelocityMargin = raw.authoredVelocityMargin;
        target.edgeSpeculation = raw.edgeSpeculation;
        target.invertedCellDetection = raw.invertedCellDetection;
        target.selfCrossingDetection = raw.selfCrossingDetection;
        target.detectionMotionGating = raw.detectionMotionGating;
        target.crossBodyDetection = raw.crossBodyDetection;
        target.selfStandDown = raw.selfStandDown;
        target.crossBodyExpelGate = raw.crossBodyExpelGate;
        target.edgeStandDown = raw.edgeStandDown;
        target.crossingRepulsion = raw.crossingRepulsion;
        target.crossingRepulsionGuide = raw.crossingRepulsionGuide;
        target.crossingRepulsionSelfGuide = raw.crossingRepulsionSelfGuide;
        target.overlapConstraints = raw.overlapConstraints;
        target.overlapRigid = raw.overlapRigid;
        target.overlapSkipSelfTangled = raw.overlapSkipSelfTangled;
        target.overlapEdgeStandDown = raw.overlapEdgeStandDown;
        target.overlapSkinVolume = raw.overlapSkinVolume;
        target.overlapSelfRegions = raw.overlapSelfRegions;
        target.overlapNormalPush = raw.overlapNormalPush;
        target.overlapMultiVolume = raw.overlapMultiVolume;
        target.recoveryPace = raw.recoveryPace;
        target.overlapConstraintPace = raw.overlapConstraintPace;
        target.overlapKeptDepth = raw.overlapKeptDepth;
        target.overlapProgressMargin = raw.overlapProgressMargin;
        target.overlapSplit = raw.overlapSplit;
        target.overlapPatience = raw.overlapPatience;
        target.overlapPatchConstraints =
            raw.overlapPatchConstraints;
        if (freeRaw) {
            raw.free();
        }
    }
    intoRaw() {
        let raw = new RawSoftRecoverySettings();
        raw.authoredVelocityMargin = this.authoredVelocityMargin;
        raw.edgeSpeculation = this.edgeSpeculation;
        raw.invertedCellDetection = this.invertedCellDetection;
        raw.selfCrossingDetection = this.selfCrossingDetection;
        raw.detectionMotionGating = this.detectionMotionGating;
        raw.crossBodyDetection = this.crossBodyDetection;
        raw.selfStandDown = this.selfStandDown;
        raw.crossBodyExpelGate = this.crossBodyExpelGate;
        raw.edgeStandDown = this.edgeStandDown;
        raw.crossingRepulsion = this.crossingRepulsion;
        raw.crossingRepulsionGuide = this.crossingRepulsionGuide;
        raw.crossingRepulsionSelfGuide = this.crossingRepulsionSelfGuide;
        raw.overlapConstraints = this.overlapConstraints;
        raw.overlapRigid = this.overlapRigid;
        raw.overlapSkipSelfTangled = this.overlapSkipSelfTangled;
        raw.overlapEdgeStandDown = this.overlapEdgeStandDown;
        raw.overlapSkinVolume = this.overlapSkinVolume;
        raw.overlapSelfRegions = this.overlapSelfRegions;
        raw.overlapNormalPush = this.overlapNormalPush;
        raw.overlapMultiVolume = this.overlapMultiVolume;
        raw.recoveryPace = this.recoveryPace;
        raw.overlapConstraintPace = this.overlapConstraintPace;
        raw.overlapKeptDepth = this.overlapKeptDepth;
        raw.overlapProgressMargin = this.overlapProgressMargin;
        raw.overlapSplit = this.overlapSplit;
        raw.overlapPatience = this.overlapPatience;
        raw.overlapPatchConstraints = this
            .overlapPatchConstraints;
        return raw;
    }
}
export var SoftMeshBindingMode;
(function (SoftMeshBindingMode) {
    SoftMeshBindingMode[SoftMeshBindingMode["Direct"] = 0] = "Direct";
    SoftMeshBindingMode[SoftMeshBindingMode["DirectByPosition"] = 1] = "DirectByPosition";
    SoftMeshBindingMode[SoftMeshBindingMode["Skinned"] = 2] = "Skinned";
})(SoftMeshBindingMode || (SoftMeshBindingMode = {}));
export class SoftMeshBinding {
    constructor(mode) {
        this.mode = mode;
        this.particles = new Uint32Array(0);
        this.eps = 0.0;
        this.selfContacts = false;
    }
    static direct(particles) {
        let res = new SoftMeshBinding(SoftMeshBindingMode.Direct);
        res.particles = Uint32Array.from(particles);
        return res;
    }
    static directByPosition(eps) {
        let res = new SoftMeshBinding(SoftMeshBindingMode.DirectByPosition);
        res.eps = eps;
        return res;
    }
    static skinned() {
        return new SoftMeshBinding(SoftMeshBindingMode.Skinned);
    }
    setSelfContacts(enabled) {
        this.selfContacts = enabled;
        return this;
    }
    rawMode() {
        return this.mode;
    }
}
export class SoftBodyMaterial {
    constructor() {
        SoftBodyMaterial.copyFromRaw(this, new RawSoftBodyMaterial(), true);
    }
    static uniform(naturalFrequency, dampingRatio) {
        let res = new SoftBodyMaterial();
        let raw = RawSoftBodyMaterial.uniform(naturalFrequency, dampingRatio);
        SoftBodyMaterial.copyFromRaw(res, raw, true);
        return res;
    }
    static fromRaw(raw) {
        let res = new SoftBodyMaterial();
        SoftBodyMaterial.copyFromRaw(res, raw, true);
        return res;
    }
    static copyFromRaw(target, raw, freeRaw) {
        target.edgeSoftness = {
            naturalFrequency: raw.edgeFrequency,
            dampingRatio: raw.edgeDampingRatio,
        };
        target.bendSoftness = {
            naturalFrequency: raw.bendFrequency,
            dampingRatio: raw.bendDampingRatio,
        };
        target.volumeSoftness = {
            naturalFrequency: raw.volumeFrequency,
            dampingRatio: raw.volumeDampingRatio,
        };
        target.shapeMatchingSoftness = {
            naturalFrequency: raw.shapeMatchingFrequency,
            dampingRatio: raw.shapeMatchingDampingRatio,
        };
        target.youngModulus = raw.youngModulus;
        target.poissonRatio = raw.poissonRatio;
        target.elasticDampingRatio = raw.elasticDampingRatio;
        target.plasticYield = raw.plasticYield;
        target.plasticCreep = raw.plasticCreep;
        target.plasticMax = raw.plasticMax;
        target.deformationDamping = raw.deformationDamping;
        target.edgePlasticYield = raw.edgePlasticYield;
        target.edgePlasticCreep = raw.edgePlasticCreep;
        target.edgePlasticMax = raw.edgePlasticMax;
        target.edgePlasticFlow =
            raw.edgePlasticFlow;
        target.tearStrain = raw.tearStrain ?? null;
        target.tearForce = raw.tearForce ?? null;
        target.tearSmoothing = raw.tearSmoothing;
        target.interiorStrength = raw.interiorStrength;
        target.maxTearsPerStep = raw.maxTearsPerStep;
        target.minPiece = raw.minPiece ?? null;
        if (freeRaw) {
            raw.free();
        }
    }
    intoRaw() {
        let raw = new RawSoftBodyMaterial();
        raw.edgeFrequency = this.edgeSoftness.naturalFrequency;
        raw.edgeDampingRatio = this.edgeSoftness.dampingRatio;
        raw.bendFrequency = this.bendSoftness.naturalFrequency;
        raw.bendDampingRatio = this.bendSoftness.dampingRatio;
        raw.volumeFrequency = this.volumeSoftness.naturalFrequency;
        raw.volumeDampingRatio = this.volumeSoftness.dampingRatio;
        raw.shapeMatchingFrequency =
            this.shapeMatchingSoftness.naturalFrequency;
        raw.shapeMatchingDampingRatio = this.shapeMatchingSoftness.dampingRatio;
        raw.youngModulus = this.youngModulus;
        raw.poissonRatio = this.poissonRatio;
        raw.elasticDampingRatio = this.elasticDampingRatio;
        raw.plasticYield = this.plasticYield;
        raw.plasticCreep = this.plasticCreep;
        raw.plasticMax = this.plasticMax;
        raw.deformationDamping = this.deformationDamping;
        raw.edgePlasticYield = this.edgePlasticYield;
        raw.edgePlasticCreep = this.edgePlasticCreep;
        raw.edgePlasticMax = this.edgePlasticMax;
        raw.edgePlasticFlow = this
            .edgePlasticFlow;
        raw.tearStrain = this.tearStrain ?? undefined;
        raw.tearForce = this.tearForce ?? undefined;
        raw.tearSmoothing = this.tearSmoothing;
        raw.interiorStrength = this.interiorStrength;
        raw.maxTearsPerStep = this.maxTearsPerStep;
        raw.minPiece = this.minPiece ?? undefined;
        return raw;
    }
}
export class SoftBody {
    constructor(rawSet, bodies, colliders, handle) {
        this.rawSet = rawSet;
        this.bodies = bodies;
        this.colliders = colliders;
        this.handle = handle;
    }
    finalizeDeserialization(bodies, colliders) {
        this.bodies = bodies;
        this.colliders = colliders;
    }
    isValid() {
        return this.rawSet.contains(this.handle);
    }
    topologyVersion() {
        return this.rawSet.sbTopologyVersion(this.handle);
    }
    numParticles() {
        return this.rawSet.sbNumParticles(this.handle);
    }
    particlePosition(i, target) {
        this.rawSet.sbParticlePosition(this.handle, i, scratchBuffer);
        return VectorOps.fromBuffer(scratchBuffer, target);
    }
    particlePositions() {
        return this.rawSet.sbParticlePositions(this.handle);
    }
    particleVelocity(i, target) {
        this.rawSet.sbParticleVelocity(this.handle, i, scratchBuffer);
        return VectorOps.fromBuffer(scratchBuffer, target);
    }
    particleVelocities() {
        return this.rawSet.sbParticleVelocities(this.handle);
    }
    particleRestPosition(i, target) {
        this.rawSet.sbParticleRestPosition(this.handle, i, scratchBuffer);
        return VectorOps.fromBuffer(scratchBuffer, target);
    }
    particleMass(i) {
        return this.rawSet.sbParticleMass(this.handle, i);
    }
    isParticlePinned(i) {
        return this.rawSet.sbIsParticlePinned(this.handle, i);
    }
    isParticleOnSurface(i) {
        return this.rawSet.sbIsParticleOnSurface(this.handle, i);
    }
    isParticleDamaged(i) {
        return this.rawSet.sbIsParticleDamaged(this.handle, i);
    }
    setParticlePosition(i, position) {
        let rawPos = VectorOps.intoRaw(position);
        this.rawSet.sbSetParticlePosition(this.handle, i, rawPos);
        rawPos.free();
    }
    setParticleVelocity(i, velocity) {
        let rawVel = VectorOps.intoRaw(velocity);
        this.rawSet.sbSetParticleVelocity(this.handle, i, rawVel);
        rawVel.free();
    }
    setParticleKinematicTarget(i, position) {
        let rawPos = VectorOps.intoRaw(position);
        this.rawSet.sbSetParticleKinematicTarget(this.handle, i, rawPos);
        rawPos.free();
    }
    setParticlePinned(i, pinned) {
        this.rawSet.sbSetParticlePinned(this.handle, i, pinned);
    }
    attachParticle(i, body) {
        this.rawSet.sbAttachParticle(this.handle, i, body.handle, this.bodies.raw);
    }
    detachParticle(i) {
        return this.rawSet.sbDetachParticle(this.handle, i);
    }
    numAttachments() {
        return this.rawSet.sbNumAttachments(this.handle);
    }
    attachmentParticle(i) {
        return this.rawSet.sbAttachmentParticle(this.handle, i);
    }
    attachmentBody(i) {
        return this.bodies.get(this.rawSet.sbAttachmentBody(this.handle, i));
    }
    numEdges() {
        return this.rawSet.sbNumEdges(this.handle);
    }
    edges() {
        return this.rawSet.sbEdges(this.handle);
    }
    edgeRestLength(i) {
        return this.rawSet.sbEdgeRestLength(this.handle, i);
    }
    isEdgeBend(i) {
        return this.rawSet.sbEdgeIsBend(this.handle, i);
    }
    edgeImpulse(i) {
        return this.rawSet.sbEdgeImpulse(this.handle, i);
    }
    edgeStress(i) {
        return this.rawSet.sbEdgeStress(this.handle, i);
    }
    edgePlasticStrain(i) {
        return this.rawSet.sbEdgePlasticStrain(this.handle, i);
    }
    edgeTearResistance(i) {
        return this.rawSet.sbEdgeTearResistance(this.handle, i);
    }
    numCells() {
        return this.rawSet.sbNumCells(this.handle);
    }
    cells() {
        return this.rawSet.sbCells(this.handle);
    }
    cellRestVolume(i) {
        return this.rawSet.sbCellRestVolume(this.handle, i);
    }
    cellStress(i) {
        return this.rawSet.sbCellStress(this.handle, i);
    }
    cellStiffnessScale(i) {
        return this.rawSet.sbCellStiffnessScale(this.handle, i);
    }
    cellTearResistance(i) {
        return this.rawSet.sbCellTearResistance(this.handle, i);
    }
    numDihedrals() {
        return this.rawSet.sbNumDihedrals(this.handle);
    }
    dihedrals() {
        return this.rawSet.sbDihedrals(this.handle);
    }
    dihedralRestAngle(i) {
        return this.rawSet.sbDihedralRestAngle(this.handle, i);
    }
    boundary() {
        return this.rawSet.sbBoundary(this.handle);
    }
    material() {
        return SoftBodyMaterial.fromRaw(this.rawSet.sbMaterial(this.handle));
    }
    setMaterial(material) {
        let raw = material.intoRaw();
        this.rawSet.sbSetMaterial(this.handle, raw);
        raw.free();
    }
    cellModel() {
        return this.rawSet.sbCellModel(this.handle);
    }
    solver() {
        return this.rawSet.sbSolver(this.handle);
    }
    setSolver(solver) {
        this.rawSet.sbSetSolver(this.handle, solver);
    }
    volumePreservationEnabled() {
        return this.rawSet.sbVolumePreservationEnabled(this.handle);
    }
    enableVolumePreservation(enabled) {
        this.rawSet.sbEnableVolumePreservation(this.handle, enabled);
    }
    restVolume() {
        return this.rawSet.sbRestVolume(this.handle);
    }
    volume() {
        return this.rawSet.sbVolume(this.handle);
    }
    volumeFactor() {
        return this.rawSet.sbVolumeFactor(this.handle);
    }
    setVolumeFactor(factor) {
        this.rawSet.sbSetVolumeFactor(this.handle, factor);
    }
    particleRadius() {
        return this.rawSet.sbParticleRadius(this.handle);
    }
    resetPlasticity() {
        this.rawSet.sbResetPlasticity(this.handle);
    }
    rootBody() {
        return this.bodies.get(this.rawSet.sbRootBody(this.handle));
    }
    origin() {
        let origin = this.rawSet.sbOrigin(this.handle);
        return origin === undefined ? null : origin;
    }
    pieces() {
        return Array.from(this.rawSet.sbPieces(this.handle));
    }
    centerOfMass(target) {
        this.rawSet.sbCenterOfMass(this.handle, scratchBuffer);
        return VectorOps.fromBuffer(scratchBuffer, target);
    }
    mass() {
        return this.rawSet.sbMass(this.handle);
    }
    isSleeping() {
        return this.rawSet.sbIsSleeping(this.handle);
    }
    wakeUp() {
        this.rawSet.sbWakeUp(this.handle);
    }
    isEnabled() {
        return this.rawSet.sbIsEnabled(this.handle);
    }
    setEnabled(enabled) {
        this.rawSet.sbSetEnabled(this.handle, enabled);
    }
    setAdditionalPgsIterations(iterations) {
        this.rawSet.sbSetAdditionalPgsIterations(this.handle, iterations);
    }
    linearDamping() {
        return this.rawSet.sbLinearDamping(this.handle);
    }
    gravityScale() {
        return this.rawSet.sbGravityScale(this.handle);
    }
    addForce(force, wakeUp) {
        let rawForce = VectorOps.intoRaw(force);
        this.rawSet.sbAddForce(this.handle, rawForce, wakeUp);
        rawForce.free();
    }
    addParticleForce(i, force, wakeUp) {
        let rawForce = VectorOps.intoRaw(force);
        this.rawSet.sbAddParticleForce(this.handle, i, rawForce, wakeUp);
        rawForce.free();
    }
    resetForces(wakeUp) {
        this.rawSet.sbResetForces(this.handle, wakeUp);
    }
    applyImpulse(impulse, wakeUp) {
        let rawImpulse = VectorOps.intoRaw(impulse);
        this.rawSet.sbApplyImpulse(this.handle, rawImpulse, wakeUp);
        rawImpulse.free();
    }
    applyParticleImpulse(i, impulse, wakeUp) {
        let rawImpulse = VectorOps.intoRaw(impulse);
        this.rawSet.sbApplyParticleImpulse(this.handle, i, rawImpulse, wakeUp);
        rawImpulse.free();
    }
    applyImpulseAtPoint(impulse, point, falloffRadius, wakeUp) {
        let rawImpulse = VectorOps.intoRaw(impulse);
        let rawPoint = VectorOps.intoRaw(point);
        this.rawSet.sbApplyImpulseAtPoint(this.handle, rawImpulse, rawPoint, falloffRadius, wakeUp);
        rawImpulse.free();
        rawPoint.free();
    }
    applyRadialImpulse(center, magnitude, falloffRadius, wakeUp) {
        let rawCenter = VectorOps.intoRaw(center);
        this.rawSet.sbApplyRadialImpulse(this.handle, rawCenter, magnitude, falloffRadius, wakeUp);
        rawCenter.free();
    }
    tearEdge(i) {
        this.rawSet.sbTearEdge(this.handle, i);
    }
    tearCell(i) {
        this.rawSet.sbTearCell(this.handle, i);
    }
    hasPendingTears() {
        return this.rawSet.sbHasPendingTears(this.handle);
    }
    numClusters() {
        return this.rawSet.sbNumClusters(this.handle);
    }
    isClusterLive(i) {
        return this.rawSet.sbIsClusterLive(this.handle, i);
    }
    clusterProxy(i) {
        let proxy = this.rawSet.sbClusterProxy(this.handle, i);
        return proxy === undefined ? null : this.bodies.get(proxy);
    }
    clusterParticles(i) {
        return this.rawSet.sbClusterParticles(this.handle, i);
    }
    clusterShapeMatchingEnabled(i) {
        return this.rawSet.sbClusterShapeMatchingEnabled(this.handle, i);
    }
    enableClusterShapeMatching(i, enabled) {
        this.rawSet.sbEnableClusterShapeMatching(this.handle, i, enabled);
    }
    setClusterStiffnessScale(i, scale) {
        this.rawSet.sbSetClusterStiffnessScale(this.handle, i, scale);
    }
    setClusterEdgeSoftness(i, softness) {
        this.rawSet.sbSetClusterEdgeSoftness(this.handle, i, softness ? softness.naturalFrequency : undefined, softness ? softness.dampingRatio : undefined);
    }
    setClusterTearResistance(i, resistance) {
        this.rawSet.sbSetClusterTearResistance(this.handle, i, resistance);
    }
    setClusterPinned(i, pinned) {
        this.rawSet.sbSetClusterPinned(this.handle, i, pinned);
    }
    setClusterKinematicTarget(i, translation, rotation) {
        let rawTra = VectorOps.intoRaw(translation);
        let rawRot = RotationOps.intoRaw(rotation);
        this.rawSet.sbSetClusterKinematicTarget(this.handle, i, rawTra, rawRot);
        rawTra.free();
        rawRot.free();
    }
    numMeshes() {
        return this.rawSet.sbNumMeshes(this.handle);
    }
    meshCluster(i) {
        let cluster = this.rawSet.sbMeshCluster(this.handle, i);
        return cluster === undefined ? null : cluster;
    }
    meshCollider(i) {
        let collider = this.rawSet.sbMeshCollider(this.handle, i);
        return collider === undefined ? null : this.colliders.get(collider);
    }
    isMeshSkinned(i) {
        return this.rawSet.sbMeshIsSkinned(this.handle, i);
    }
    meshCollisionEnabled(i) {
        return this.rawSet.sbMeshCollisionEnabled(this.handle, i);
    }
    isMeshOriented(i) {
        return this.rawSet.sbMeshIsOriented(this.handle, i);
    }
    meshVertices(i) {
        return this.rawSet.sbMeshVertices(this.handle, i);
    }
    meshIndices(i) {
        return this.rawSet.sbMeshIndices(this.handle, i);
    }
    meshOfCollider(collider) {
        let mesh = this.rawSet.sbMeshOfCollider(this.handle, collider.handle);
        return mesh === undefined ? null : mesh;
    }
}
export class SoftBodyDesc {
    constructor(positions) {
        let flat = positions
            ? Float64Array.from(positions)
            : new Float64Array(0);
        this.generator = () => new RawSoftBodyBuilder(flat);
        this.setters = [];
        this.material = null;
        this.softness = null;
        this.particleMass = 1.0;
        this.mass = null;
        this.masses = null;
        this.pinnedParticles = new Uint32Array(0);
        this.cellModel = SoftBodyCellModel.Volume;
        this.solver = SoftBodySolver.Constraints;
        this.volumePreservation = null;
        this.volumeFactor = 1.0;
        this.shapeMatching = null;
        this.selfContacts = false;
        this.oriented = null;
        this.particleRadius = null;
        this.surfaceCollider = ColliderDesc.ball(0.05);
        this.skinCollision = false;
        this.translation = null;
        this.linearDamping = 0.0;
        this.gravityScale = 1.0;
        this.additionalSolverIterations = 0;
        this.additionalPgsIterations = 3;
        this.canSleep = true;
        this.dominanceGroup = 0;
    }
    static withGenerator(generator) {
        let probe = generator();
        if (!probe) {
            return null;
        }
        probe.free();
        let desc = new SoftBodyDesc();
        desc.generator = generator;
        return desc;
    }
    static rope(start, end, numParticles) {
        return SoftBodyDesc.withGenerator(() => {
            let rawStart = VectorOps.intoRaw(start);
            let rawEnd = VectorOps.intoRaw(end);
            let raw = RawSoftBodyBuilder.rope(rawStart, rawEnd, numParticles);
            rawStart.free();
            rawEnd.free();
            return raw;
        });
    }
    static volumetric(vertices, indices, cellSize, skinned = false) {
        return SoftBodyDesc.withGenerator(() => RawSoftBodyBuilder.volumetric(vertices, indices, cellSize, skinned));
    }
    static trimesh(vertices, indices) {
        return SoftBodyDesc.withGenerator(() => RawSoftBodyBuilder.trimesh(vertices, indices));
    }
    static cloth(origin, du, dv, nu, nv) {
        return SoftBodyDesc.withGenerator(() => {
            let rawOrigin = VectorOps.intoRaw(origin);
            let rawDu = VectorOps.intoRaw(du);
            let rawDv = VectorOps.intoRaw(dv);
            let raw = RawSoftBodyBuilder.cloth(rawOrigin, rawDu, rawDv, nu, nv);
            rawOrigin.free();
            rawDu.free();
            rawDv.free();
            return raw;
        });
    }
    static clothTube(origin, axis, radiusStart, radiusEnd, numAround, numAlong) {
        return SoftBodyDesc.withGenerator(() => {
            let rawOrigin = VectorOps.intoRaw(origin);
            let rawAxis = VectorOps.intoRaw(axis);
            let raw = RawSoftBodyBuilder.clothTube(rawOrigin, rawAxis, radiusStart, radiusEnd, numAround, numAlong);
            rawOrigin.free();
            rawAxis.free();
            return raw;
        });
    }
    static clothAnisotropic(origin, du, dv, nu, nv, warp, weft, shear) {
        return SoftBodyDesc.withGenerator(() => {
            let rawOrigin = VectorOps.intoRaw(origin);
            let rawDu = VectorOps.intoRaw(du);
            let rawDv = VectorOps.intoRaw(dv);
            let raw = RawSoftBodyBuilder.clothAnisotropic(rawOrigin, rawDu, rawDv, nu, nv, warp.naturalFrequency, warp.dampingRatio, weft.naturalFrequency, weft.dampingRatio, shear.naturalFrequency, shear.dampingRatio);
            rawOrigin.free();
            rawDu.free();
            rawDv.free();
            return raw;
        });
    }
    static cuboid(center, halfExtents, nx, ny, nz) {
        return SoftBodyDesc.withGenerator(() => {
            let rawCenter = VectorOps.intoRaw(center);
            let rawHalf = VectorOps.intoRaw(halfExtents);
            let raw = RawSoftBodyBuilder.cuboid(rawCenter, rawHalf, nx, ny, nz);
            rawCenter.free();
            rawHalf.free();
            return raw;
        });
    }
    static sphere(center, radius, subdivisions) {
        return SoftBodyDesc.withGenerator(() => {
            let rawCenter = VectorOps.intoRaw(center);
            let raw = RawSoftBodyBuilder.sphere(rawCenter, radius, subdivisions);
            rawCenter.free();
            return raw;
        });
    }
    setMaterial(material) {
        this.material = material;
        return this;
    }
    setSoftness(naturalFrequency, dampingRatio) {
        this.softness = { naturalFrequency, dampingRatio };
        return this;
    }
    setParticleMass(mass) {
        this.particleMass = mass;
        this.masses = null;
        return this;
    }
    setMass(mass) {
        this.mass = mass;
        return this;
    }
    setMasses(masses) {
        this.masses = Float64Array.from(masses);
        return this;
    }
    setPinnedParticles(pinned) {
        this.pinnedParticles = Uint32Array.from(pinned);
        return this;
    }
    setEdges(edges) {
        let flat = Uint32Array.from(edges);
        this.setters.push((raw) => raw.setEdges(flat));
        return this;
    }
    addEdges(edges) {
        let flat = Uint32Array.from(edges);
        this.setters.push((raw) => raw.addEdges(flat));
        return this;
    }
    setBendEdges(edges) {
        let flat = Uint32Array.from(edges);
        this.setters.push((raw) => raw.setBendEdges(flat));
        return this;
    }
    setTensionOnly() {
        this.setters.push((raw) => raw.setTensionOnly());
        return this;
    }
    setDihedrals(dihedrals) {
        let flat = Uint32Array.from(dihedrals);
        this.setters.push((raw) => raw.setDihedrals(flat));
        return this;
    }
    setWire(segments) {
        let flat = Uint32Array.from(segments);
        this.setters.push((raw) => raw.setWire(flat));
        return this;
    }
    setCells(cells) {
        let flat = Uint32Array.from(cells);
        this.setters.push((raw) => raw.setCells(flat));
        return this;
    }
    setSurface(surface) {
        let flat = Uint32Array.from(surface);
        this.setters.push((raw) => raw.setSurface(flat));
        return this;
    }
    setSkin(vertices, indices) {
        let flatVertices = Float64Array.from(vertices);
        let flatIndices = Uint32Array.from(indices);
        this.setters.push((raw) => raw.setSkin(flatVertices, flatIndices));
        return this;
    }
    setSkinCollision(enabled) {
        this.skinCollision = enabled;
        return this;
    }
    setEdgeSoftness(edges, softness) {
        let flatEdges = Uint32Array.from(edges);
        let frequencies = Float64Array.from(softness.map((s) => s.naturalFrequency));
        let dampings = Float64Array.from(softness.map((s) => s.dampingRatio));
        this.setters.push((raw) => raw.setEdgeSoftness(flatEdges, frequencies, dampings));
        return this;
    }
    setEdgeTearResistance(edges, resistances) {
        let flatEdges = Uint32Array.from(edges);
        let flatResistances = Float64Array.from(resistances);
        this.setters.push((raw) => raw.setEdgeTearResistance(flatEdges, flatResistances));
        return this;
    }
    setCellModel(model) {
        this.cellModel = model;
        return this;
    }
    setSolver(solver) {
        this.solver = solver;
        return this;
    }
    setVolumePreservation(enabled) {
        this.volumePreservation = enabled;
        return this;
    }
    setVolumeFactor(factor) {
        this.volumeFactor = factor;
        this.volumePreservation = true;
        return this;
    }
    setShapeMatching(enabled) {
        this.shapeMatching = enabled;
        return this;
    }
    setSelfContacts(enabled) {
        this.selfContacts = enabled;
        return this;
    }
    setOriented(oriented) {
        this.oriented = oriented;
        return this;
    }
    setParticleRadius(radius) {
        this.particleRadius = radius;
        return this;
    }
    setSurfaceCollider(collider) {
        this.surfaceCollider = collider;
        return this;
    }
    setNoSurfaceCollider() {
        this.surfaceCollider = null;
        return this;
    }
    setTranslation(translation) {
        this.translation = translation;
        return this;
    }
    setLinearDamping(damping) {
        this.linearDamping = damping;
        return this;
    }
    setGravityScale(scale) {
        this.gravityScale = scale;
        return this;
    }
    setAdditionalSolverIterations(iterations) {
        this.additionalSolverIterations = iterations;
        return this;
    }
    setAdditionalPgsIterations(iterations) {
        this.additionalPgsIterations = iterations;
        return this;
    }
    setCanSleep(canSleep) {
        this.canSleep = canSleep;
        return this;
    }
    setDominanceGroup(group) {
        this.dominanceGroup = group;
        return this;
    }
    setUserData(data) {
        this.userData = data;
        return this;
    }
    append(other) {
        this.setters.push((raw) => {
            let rawOther = other.intoRaw();
            raw.append(rawOther);
            rawOther.free();
        });
        return this;
    }
    intoRaw() {
        let raw = this.generator();
        for (let setter of this.setters) {
            setter(raw);
        }
        if (this.material) {
            let rawMaterial = this.material.intoRaw();
            raw.setMaterial(rawMaterial);
            rawMaterial.free();
        }
        if (this.softness) {
            raw.setSoftness(this.softness.naturalFrequency, this.softness.dampingRatio);
        }
        if (this.masses) {
            raw.setMasses(this.masses);
        }
        else {
            raw.setParticleMass(this.particleMass);
        }
        if (this.mass !== null) {
            raw.setMass(this.mass);
        }
        raw.setPinnedParticles(this.pinnedParticles);
        raw.setCellModel(this.cellModel);
        raw.setSolver(this.solver);
        if (this.volumePreservation !== null) {
            raw.setVolumePreservation(this.volumePreservation);
        }
        raw.setVolumeFactor(this.volumeFactor);
        if (this.shapeMatching !== null) {
            raw.setShapeMatching(this.shapeMatching);
        }
        raw.setSelfContacts(this.selfContacts);
        if (this.oriented !== null) {
            raw.setOriented(this.oriented);
        }
        if (this.particleRadius !== null) {
            raw.setParticleRadius(this.particleRadius);
        }
        raw.setSkinCollision(this.skinCollision);
        if (this.surfaceCollider) {
            let c = this.surfaceCollider;
            raw.setSurfaceCollider(c.friction, c.restitution, c.frictionCombineRule, c.restitutionCombineRule, c.isSensor, c.collisionGroups, c.solverGroups, c.activeCollisionTypes, c.activeHooks, c.activeEvents, c.contactForceEventThreshold, c.contactSkin);
        }
        else {
            raw.setNoSurfaceCollider();
        }
        if (this.translation) {
            let rawTra = VectorOps.intoRaw(this.translation);
            raw.translated(rawTra);
            rawTra.free();
        }
        raw.setLinearDamping(this.linearDamping);
        raw.setGravityScale(this.gravityScale);
        raw.setAdditionalSolverIterations(this.additionalSolverIterations);
        raw.setAdditionalPgsIterations(this.additionalPgsIterations);
        raw.setCanSleep(this.canSleep);
        raw.setDominanceGroup(this.dominanceGroup);
        return raw;
    }
    numParticles() {
        let raw = this.intoRaw();
        let n = raw.numParticles();
        raw.free();
        return n;
    }
    particlePositions() {
        let raw = this.intoRaw();
        let positions = raw.particlePositions();
        raw.free();
        return positions;
    }
}
export class SoftBodyTearEvent {
    constructor(raw) {
        this.raw = raw;
    }
    free() {
        if (!!this.raw) {
            this.raw.free();
        }
        this.raw = undefined;
    }
    softBody() {
        return this.raw.softBody();
    }
    tornEdges() {
        return this.raw.tornEdges();
    }
    tornCells() {
        return this.raw.tornCells();
    }
    removedEdges() {
        return this.raw.removedEdges();
    }
    splitParticles() {
        return this.raw.splitParticles();
    }
    insertedParticles() {
        return this.raw.insertedParticles();
    }
    seeds() {
        return this.raw.seeds();
    }
    numPieces() {
        return this.raw.numPieces();
    }
    pieceSoftBody(i) {
        return this.raw.pieceSoftBody(i);
    }
    pieceParticles(i) {
        return this.raw.pieceParticles(i);
    }
    pieceClusters(i) {
        return this.raw.pieceClusters(i);
    }
    numClusterSplits() {
        return this.raw.numClusterSplits();
    }
    clusterSplitSource(i) {
        return this.raw.clusterSplitSource(i);
    }
    clusterSplitSoftBody(i) {
        return this.raw.clusterSplitSoftBody(i);
    }
    clusterSplitCluster(i) {
        return this.raw.clusterSplitCluster(i);
    }
    clusterSplitProxy(i) {
        return this.raw.clusterSplitProxy(i);
    }
    clusterSplitKeepsProxy(i) {
        return this.raw.clusterSplitKeepsProxy(i);
    }
    numMovedJoints() {
        return this.raw.numMovedJoints();
    }
    movedJoint(i) {
        return this.raw.movedJoint(i);
    }
    movedJointFrom(i) {
        return this.raw.movedJointFrom(i);
    }
    movedJointTo(i) {
        return this.raw.movedJointTo(i);
    }
    particleDestination(particle) {
        let body = this.raw.particleDestinationBody(particle);
        let index = this.raw.particleDestinationIndex(particle);
        if (body === undefined || index === undefined) {
            return null;
        }
        return { softBody: body, particle: index };
    }
}
