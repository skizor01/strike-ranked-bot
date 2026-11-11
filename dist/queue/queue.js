import { Mutex } from "async-mutex";
import { Errors } from "../types/errors.js";
import {} from "../types/queue.js";
import eventEmitter from "../utils/EventEmitter.js";
export class QueueClass {
    mutex = new Mutex();
    channelId;
    players;
    size;
    mode;
    active;
    queueType;
    timeouts;
    timeoutDuration = 15 * 60 * 1000;
    constructor(cid, queueType, isActive, mode) {
        this.channelId = cid;
        this.queueType = queueType;
        this.active = isActive;
        this.players = [];
        this.size = parseInt(this.queueType.split("v")[0]) * 2;
        this.timeouts = new Map();
        this.mode = mode;
    }
    async joinQueue(playerId, timeout = this.timeoutDuration) {
        // console.log("add player");
        await this.mutex.runExclusive(() => {
            const isFull = this.checkIsFull();
            const isInQueue = this.checkInQueue(playerId);
            const isActive = this.active;
            if (!isActive)
                throw new Error(Errors.queueNotActive);
            if (isFull)
                throw new Error(Errors.queueFull);
            if (isInQueue) {
                this.#refreshTimeout(playerId, timeout);
                throw new Error(Errors.inQueue);
            }
            this.players.push(playerId);
            this.#startTimer(playerId, timeout);
        });
    }
    async leaveQueue(playerId) {
        await this.mutex.runExclusive(() => {
            const isFull = this.checkIsFull();
            const isInQueue = this.checkInQueue(playerId);
            const isActive = this.active;
            if (isFull)
                throw new Error(Errors.queueFull);
            if (!isInQueue)
                throw new Error(Errors.notInQueue);
            if (!isActive)
                throw new Error(Errors.queueNotActive);
            this.players = this.players.filter((id) => id !== playerId);
            this.#removeTimeout(playerId);
        });
        // console.log("remove player");
    }
    async clearQueue() {
        const players = await this.mutex.runExclusive(() => {
            // console.log("clear queue");
            const players = [...this.players];
            for (const id of players) {
                this.#removeTimeout(id);
            }
            this.players.length = 0;
            return players;
        });
        return players;
    }
    checkInQueue(playerId) {
        return this.players.includes(playerId);
    }
    checkIsFull() {
        return this.players.length === this.size;
    }
    // PRIVATE FUNCTIONS
    #startTimer(playerId, timeoutLALALALAAL = this.timeoutDuration) {
        // console.log("start timer");
        if (timeoutLALALALAAL < 0)
            timeoutLALALALAAL = this.timeoutDuration;
        const timeout = setTimeout(async () => {
            void this.mutex.runExclusive(() => {
                this.players = this.players.filter((id) => id !== playerId);
            }).then(() => {
                eventEmitter.emit("playerLeave", this.channelId, playerId, "afk");
            }).catch(console.log);
        }, timeoutLALALALAAL);
        this.timeouts.set(playerId, timeout);
    }
    #refreshTimeout(playerId, timeout) {
        // console.log("refresh timeout");
        const oldId = this.timeouts.get(playerId);
        clearTimeout(oldId);
        this.#startTimer(playerId, timeout);
    }
    #removeTimeout(playerId) {
        // console.log("remove timeout");
        const oldId = this.timeouts.get(playerId);
        clearTimeout(oldId);
        this.timeouts.delete(playerId);
    }
    // GETTER AND SETTER
    getQueueSize() {
        return this.size;
    }
    getQueueCurrentSize() {
        return this.players.length;
    }
    getQueueType() {
        return this.queueType;
    }
    getPlayers() {
        return [...this.players];
    }
    getIsActive() {
        return this.active;
    }
    getChannelId() {
        return this.channelId;
    }
    getQueueMode() {
        return this.mode;
    }
    setQueueStatus(active) {
        this.active = active;
    }
}
