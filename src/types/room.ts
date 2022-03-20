interface RoomMemory {
    availableSourceAccessPoints: string[];
    sourceAccessPointCount: number;
    roadsConstructed?: boolean;
}

interface Room {
    initRoomMemory(): void;
}

interface RoomPosition {
    toMemSafe(): string;
}

Room.prototype.initRoomMemory = function (this: Room) {
    this.memory.availableSourceAccessPoints = this.find(FIND_SOURCES) //
        .flatMap((source) =>
            this.lookForAtArea(LOOK_TERRAIN, source.pos.y - 1, source.pos.x - 1, source.pos.y + 1, source.pos.x + 1, true)
                .filter((terrain) => terrain.terrain != 'wall')
                .map((terrain) => new RoomPosition(terrain.x, terrain.y, this.name).toMemSafe())
        );

    this.memory.sourceAccessPointCount = this.memory.availableSourceAccessPoints.length;
};

RoomPosition.prototype.toMemSafe = function (this: RoomPosition): string {
    return `${this.x}.${this.y}.${this.roomName}`;
};
