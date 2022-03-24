interface RoomMemory {
    collectQueueCooldown: number;
    repairSearchCooldown: number;
    collectQueue: Id<Structure | Tombstone | Resource>[];
    repairQueue: Id<Structure<StructureConstant>>[];
    miningAssignments: Map<string, AssignmentStatus>;
    containerPositions?: string[];
    phaseShift?: PhaseShiftStatus;
    phase?: number;
    availableSourceAccessPoints: string[];
    sourceAccessPointCount: number;
    roadsConstructed?: boolean;
}

interface Room {
    getRepairTarget(): Id<Structure>;
}

interface RoomPosition {
    toMemSafe(): string;
}

const enum PhaseShiftStatus {
    PREPARE = 'Preparing',
    EXECUTE = 'Execute',
}

const enum AssignmentStatus {
    UNASSIGNED = 'unassigned',
    ASSIGNED = 'assigned',
}
