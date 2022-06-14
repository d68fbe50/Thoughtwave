import { TransportCreep } from '../virtualCreeps/transportCreep';

export class Distributor extends TransportCreep {
    protected findTarget() {
        let target: any;

        if (this.store.energy < this.store.getUsedCapacity() && this.room.storage?.store.getFreeCapacity()) {
            target = this.homeroom.storage?.id;
        }

        if (!target && (this.homeroom.storage?.store.energy > 0 || this.store.energy > 0)) {
            target = this.findRefillTarget();
        }

        // if(this.room.memory.labTasks.some(task => task.status === TaskStatus.PREPARING)){
        //     let labTask = this.room.memory.labTasks.find(task => task.status === TaskStatus.PREPARING);
        //     target = labTask.primaryLab;
        // }

        if (!target && this.store.getUsedCapacity() < this.store.getCapacity() / 2) {
            target = this.findCollectionTarget();
        }

        if (!target && this.room.storage?.store.getFreeCapacity()) {
            target = this.homeroom.storage?.id;
        }

        return target;
    }
}
