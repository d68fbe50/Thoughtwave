import { computeRoomNameFromDiff, getExitDirections, isCenterRoom, isKeeperRoom } from './data';
import { getRoad, storeRoadInMemory } from './roads';
import { getStoragePos } from './roomDesign';

//Calculate maintenance cost of road to source per road decay cycle. Considers pre-existing roads in homeroom and roomData to be .5 cost of plains. Doesn't consider travel wear
function calculateSourceRoadStats(
    sourcePos: RoomPosition,
    room: Room,
    ignoreRoomDataRoads = false
): { road: RoomPosition[], roadLength: number; maintenanceCost: number; miningPos: RoomPosition } {
    let storagePos = getStoragePos(room);

    const road = getRoad(storagePos, sourcePos, {allowedStatuses: [RoomMemoryStatus.OWNED_INVADER, RoomMemoryStatus.RESERVED_ME, RoomMemoryStatus.VACANT], ignoreOtherRoads: ignoreRoomDataRoads, destRange: 1});

    if (road.incomplete) {
        return { roadLength: -1, maintenanceCost: -1, miningPos: undefined, road: undefined };
    }
    let miningPos = road.path.pop();

    // let visualRooms = Array.from(new Set(path.path.map((pos) => pos.roomName)));
    // visualRooms.forEach((r) => {
    //     let rv = new RoomVisual(r);
    //     rv.poly(path.path.filter((p) => p.roomName === r));
    // });

    const MAINTENANCE_COST = road.cost / 2; //the cost matrix values for plains and swamp are 5x the decay value to prioritize pre-existing roads.
    const MAINTENANCE_COST_PER_CYCLE = (MAINTENANCE_COST / ROAD_DECAY_TIME) * ENERGY_REGEN_TIME; //roads decay every 1k ticks, whereas sources regen every 300
    return { road: road.path, roadLength: road.path.length, maintenanceCost: MAINTENANCE_COST_PER_CYCLE, miningPos: miningPos };
}

export function calculateRemoteSourceStats(sourcePos: RoomPosition, room: Room, ignoreRoomDataRoads = false): RemoteStats {
    //Energy output of source per regen cycle
    const SOURCE_OUTPUT_PER_CYCLE =
        isKeeperRoom(sourcePos.roomName) || isCenterRoom(sourcePos.roomName) ? SOURCE_ENERGY_KEEPER_CAPACITY : SOURCE_ENERGY_CAPACITY;

    const roadStats = calculateSourceRoadStats(sourcePos, room, ignoreRoomDataRoads);
    if (roadStats.maintenanceCost === -1) {
        return undefined;
    }

    //Cost of road maintenance per source regen cycle
    const ROAD_MAINTENANCE_PER_CYCLE = roadStats.maintenanceCost;

    //cost of miner production per regen cycle
    const MINER_WORK_NEEDED = Math.ceil(SOURCE_OUTPUT_PER_CYCLE / HARVEST_POWER / ENERGY_REGEN_TIME) + 1; //+1 because miner needs to repair container
    const MINER_MOVE_NEEDED = Math.ceil((MINER_WORK_NEEDED + 1) / 2);
    const MINER_COST_PER_CYCLE =
        ((BODYPART_COST[CARRY] + MINER_WORK_NEEDED * BODYPART_COST[WORK] + MINER_MOVE_NEEDED * BODYPART_COST[MOVE]) / CREEP_LIFE_TIME) *
        ENERGY_REGEN_TIME;

    //cost of gatherer production per regen cycle
    //Ideally, gatherer will move all the energy from miner container to storage before it fills up.
    const CONTAINER_FILL_RATE = MINER_WORK_NEEDED * HARVEST_POWER;
    const TICKS_TO_FILL_CONTAINER = Math.ceil(CONTAINER_CAPACITY / CONTAINER_FILL_RATE);
    const CONTAINER_MAINTENANCE_PER_CYCLE = (CONTAINER_DECAY / REPAIR_POWER / CONTAINER_DECAY_TIME) * ENERGY_REGEN_TIME; //should be 150

    const MAX_GATHERER_CAPACITY = 1900;

    const ROAD_LENGTH = roadStats.roadLength;
    const GATHERER_TRIP_DURATION = ROAD_LENGTH * 3; //takes 3x the road length to make it back to storage (2 ticks per step to storage, 1 tick per step on return), so maximum road length allowed for ONE gatherer to do the job is 100

    //if the trip can't be completed before the container fills again, we'll need more than one gatherer for max efficiency
    const GATHERERS_NEEDED = Math.ceil(GATHERER_TRIP_DURATION / TICKS_TO_FILL_CONTAINER);

    const GATHERER_WORK_NEEDED = 2;
    const GATHERER_CARRY_NEEDED = 38;
    const GATHERER_MOVE_NEEDED = 10;
    const GATHERER_COST_PER_CYCLE =
        ((GATHERER_WORK_NEEDED * BODYPART_COST[WORK] + GATHERER_CARRY_NEEDED * BODYPART_COST[CARRY] + GATHERER_MOVE_NEEDED * BODYPART_COST[MOVE]) /
            CREEP_LIFE_TIME) *
        ENERGY_REGEN_TIME;

    const RESERVER_COST_PER_CYCLE = ((BODYPART_COST[CLAIM] + BODYPART_COST[MOVE]) / CREEP_CLAIM_LIFE_TIME) * ENERGY_REGEN_TIME;

    const TOTAL_COSTS_PER_CYCLE =
        MINER_COST_PER_CYCLE +
        GATHERERS_NEEDED * GATHERER_COST_PER_CYCLE +
        RESERVER_COST_PER_CYCLE +
        CONTAINER_MAINTENANCE_PER_CYCLE +
        ROAD_MAINTENANCE_PER_CYCLE;
    const NET_INCOME_PER_CYCLE = SOURCE_OUTPUT_PER_CYCLE - TOTAL_COSTS_PER_CYCLE;

    let stats: RemoteStats = {
        sourceSize: SOURCE_OUTPUT_PER_CYCLE,
        netIncome: NET_INCOME_PER_CYCLE,
        roadLength: ROAD_LENGTH,
        roadMaintenance: ROAD_MAINTENANCE_PER_CYCLE,
        containerMaintenance: CONTAINER_MAINTENANCE_PER_CYCLE,
        minerUpkeep: MINER_COST_PER_CYCLE,
        gathererCount: GATHERERS_NEEDED,
        gathererUpkeep: GATHERER_COST_PER_CYCLE,
        reserverUpkeep: RESERVER_COST_PER_CYCLE,
        miningPos: roadStats.miningPos,
        road: roadStats.road
    };

    // for (let [key, value] of Object.entries(stats)) {
    //     console.log(`${key}: ${value}`);
    // }

    return stats;
}

export function assignRemoteSource(source: string, roomName: string){
    let current = Memory.remoteSourceAssignments[source];
    if(current){
        removeCurrentAssignment(source);
    }
    try{
        let stats: RemoteStats;
        try{
            stats = calculateRemoteSourceStats(source.toRoomPos(), Game.rooms[roomName]);
        } catch(e){
            console.log(e);
            return ERR_INVALID_ARGS;
        }

        try{
            let result = storeRoadInMemory(getStoragePos(Game.rooms[roomName]),stats.miningPos,stats.road);
            if(result !== OK){
                console.log('problem storing road to source in memory');
                return ERR_INVALID_ARGS;
            }
        } catch (e){
            console.log(e);
            return ERR_INVALID_ARGS;
        }

        let gatherers = [];
        for(let i = 0; i < stats.gathererCount; i++){
            gatherers.push(AssignmentStatus.UNASSIGNED);
        }

        Memory.remoteSourceAssignments[source] = roomName;

        Memory.rooms[roomName].remoteSources[source] = {
            gatherers: gatherers,
            miner: AssignmentStatus.UNASSIGNED,
            miningPos: stats.miningPos.toMemSafe(),
            setupStatus: RemoteSourceSetupStatus.BUILDING_CONTAINER
        };

        let remoteRoomName = source.toRoomPos().roomName;
        let remoteData: RemoteData = {
            threatLevel: RemoteRoomThreatLevel.SAFE,
        };

        if(!Memory.remoteData[remoteRoomName]){
            if (isKeeperRoom(remoteRoomName)) {
                remoteData.keeperExterminator = AssignmentStatus.UNASSIGNED;
            } else if (!isCenterRoom(remoteRoomName)) {
                remoteData.reservationState = RemoteRoomReservationStatus.LOW;
                remoteData.reserver = AssignmentStatus.UNASSIGNED;
            }
            if (isKeeperRoom(remoteRoomName) || isCenterRoom(remoteRoomName)) {
                remoteData.mineralMiner = AssignmentStatus.UNASSIGNED;
                remoteData.mineralAvailableAt = Game.time;
            }
        
            Memory.remoteData[remoteRoomName] = remoteData;
        }
        return OK;
    } catch(e){
        console.log(e);
        return ERR_INVALID_ARGS;
    }
}

export function removeCurrentAssignment(source: string){
    let current = Memory.remoteSourceAssignments[source];
    Game.creeps[Memory.rooms[current].remoteSources[source].miner]?.suicide();
    delete Memory.rooms[current].remoteSources[source];
    delete Memory.remoteSourceAssignments[source];
}

export function findRemoteMiningOptions(room: Room): { source: string; stats: RemoteStats }[] {
    let exits = getExitDirections(room.name);
    let safeRoomsDepthOne: string[] = []; //rooms we can pass through for mining
    for (let exit of exits) {
        let nextRoomName =
            exit === LEFT || exit === RIGHT
                ? computeRoomNameFromDiff(room.name, exit === LEFT ? -1 : 1, 0)
                : computeRoomNameFromDiff(room.name, 0, exit === BOTTOM ? -1 : 1);
        if (
            [RoomMemoryStatus.VACANT, RoomMemoryStatus.RESERVED_ME, RoomMemoryStatus.RESERVED_INVADER].includes(
                Memory.roomData[nextRoomName]?.roomStatus
            )
        ) {
            safeRoomsDepthOne.push(nextRoomName);
        }
    }

    let safeRoomsDepthTwo: string[] = [];
    for (let depthOneRoomName of safeRoomsDepthOne) {
        let depthOneExits = getExitDirections(depthOneRoomName);
        for (let exit of depthOneExits) {
            let nextRoomName =
                exit === LEFT || exit === RIGHT
                    ? computeRoomNameFromDiff(depthOneRoomName, exit === LEFT ? -1 : 1, 0)
                    : computeRoomNameFromDiff(depthOneRoomName, 0, exit === BOTTOM ? -1 : 1);
            if (
                [RoomMemoryStatus.VACANT, RoomMemoryStatus.RESERVED_ME, RoomMemoryStatus.RESERVED_INVADER].includes(
                    Memory.roomData[nextRoomName]?.roomStatus
                ) &&
                !safeRoomsDepthOne.includes(nextRoomName)
            ) {
                safeRoomsDepthTwo.push(nextRoomName);
            }
        }
    }

    let safeRoomsDepthThree: string[] = [];
    for (let depthTwoRoomName of safeRoomsDepthTwo) {
        let depthTwoExits = getExitDirections(depthTwoRoomName);
        for (let exit of depthTwoExits) {
            let nextRoomName =
                exit === LEFT || exit === RIGHT
                    ? computeRoomNameFromDiff(depthTwoRoomName, exit === LEFT ? -1 : 1, 0)
                    : computeRoomNameFromDiff(depthTwoRoomName, 0, exit === BOTTOM ? -1 : 1);
            if (
                [RoomMemoryStatus.VACANT, RoomMemoryStatus.RESERVED_ME, RoomMemoryStatus.RESERVED_INVADER].includes(
                    Memory.roomData[nextRoomName]?.roomStatus
                ) &&
                !safeRoomsDepthOne.includes(nextRoomName) &&
                !safeRoomsDepthTwo.includes(nextRoomName)
            ) {
                safeRoomsDepthThree.push(nextRoomName);
            }
        }
    }

    let openSources: { source: string; stats: RemoteStats }[] = [
        ..._.flatten(safeRoomsDepthOne.map((r) => Memory.roomData[r].sources.map((s) => `${s}.${r}`))),
        ..._.flatten(safeRoomsDepthTwo.map((r) => Memory.roomData[r].sources.map((s) => `${s}.${r}`))),
        ..._.flatten(safeRoomsDepthThree.map((r) => Memory.roomData[r].sources.map((s) => `${s}.${r}`))),
    ]
        .filter((source) => !Memory.remoteSourceAssignments[source])
        .map((source) => {
            let sourcePos = source.toRoomPos();
            let stats = calculateRemoteSourceStats(sourcePos, room, true);
            return { source, stats };
        });

    return openSources;
}

export function findSuitableRemoteSource(room: Room, noKeeperRooms: boolean = false): {source: string, stats: RemoteStats} {
    let options = findRemoteMiningOptions(room);

    let remoteRooms = new Set(Object.keys(room.memory.remoteSources).map(pos => pos.split('.')[2]));
    let keeperRoomsMined = 0;
    let otherRoomsMined = 0;

    remoteRooms.forEach(remoteRoom => isKeeperRoom(remoteRoom) || isCenterRoom(remoteRoom) ? keeperRoomsMined++ : otherRoomsMined++);

    if (noKeeperRooms || room.controller.level < 7 || keeperRoomsMined >= 2) {
        //pre-7 rooms can't handle central room upkeep
        options = options.filter((option) => option.stats.sourceSize === 3000);
    } 

    //prefer central rooms over other rooms and prefer closer to farther
    options.sort((a, b) => b.stats.netIncome - a.stats.netIncome);

    return options.shift();
}