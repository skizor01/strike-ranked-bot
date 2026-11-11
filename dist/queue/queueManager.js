import path from "path";
import { QueueClass } from "./queue.js";
import { loadJSONData } from "../utils/loadCommands.js";
import {} from "../types/queue.js";
import { fileURLToPath } from "url";
import { Errors } from "../types/errors.js";
import eventEmitter from "../utils/EventEmitter.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
class QueuesManager {
    queues;
    constructor() {
        this.queues = new Map();
    }
    async init() {
        const queuePath = path.join(__dirname, "../", "config", "queues.json");
        const data = await loadJSONData(queuePath);
        for (const queue of data) {
            this.queues.set(queue.channelId, new QueueClass(queue.channelId, queue.queueType, queue.active, queue.mode));
        }
        console.log("All queues succesfully loaded");
    }
    async joinQueue(channelId, userId, timeout = -1) {
        const queue = this.#getQueue(channelId);
        if (!queue)
            throw new Error(Errors.notQueue);
        await queue.joinQueue(userId, timeout);
        return queue;
    }
    async leaveQueue(channelId, userId) {
        const queue = this.#getQueue(channelId);
        if (!queue)
            throw new Error(Errors.notQueue);
        await queue.leaveQueue(userId);
        return queue;
    }
    viewQueue(channelId) {
        const queue = this.#getQueue(channelId);
        if (!queue)
            throw new Error(Errors.notQueue);
        return queue;
    }
    #getQueue(channelId) {
        return this.queues.get(channelId);
    }
    async refreshQueues() {
        for (const [channelId, queue] of this.queues) {
            this.queues.delete(channelId);
        }
        await this.init();
    }
    async checkInOtherQueues(playerId, currentQueueId) {
        for (const [channelId, queue] of this.queues) {
            if (channelId === currentQueueId)
                continue;
            if (queue.checkInQueue(playerId)) {
                await queue.leaveQueue(playerId);
                eventEmitter.emit("playerLeave", channelId, playerId, "multiQueue", currentQueueId);
                return channelId;
            }
        }
    }
    async checkInAnyQueue(playerId) {
        for (const [channelId, queue] of this.queues) {
            if (queue.checkInQueue(playerId)) {
                await queue.leaveQueue(playerId);
                return channelId;
            }
        }
    }
    checkIsQueue(channelId) {
        return this.queues.has(channelId);
    }
    disableQueue(queueId) {
        const queue = this.getQueue(queueId);
        queue.setQueueStatus(false);
    }
    enableQueue(queueId) {
        const queue = this.getQueue(queueId);
        queue.setQueueStatus(true);
    }
    disableAllQueues() {
        for (const [id, queue] of this.queues) {
            queue.setQueueStatus(false);
        }
    }
    enableAllQueues() {
        for (const [id, queue] of this.queues) {
            queue.setQueueStatus(true);
        }
    }
    returnAllQueues() {
        return this.queues;
    }
    getQueue(channelId) {
        const queue = this.#getQueue(channelId);
        if (!queue)
            throw new Error(Errors.notQueue);
        return queue;
    }
    findQueue(queueType) {
        let found = null;
        for (const [id, queue] of this.queues) {
            if (queue.getQueueType() === queueType)
                found = queue;
        }
        return found;
    }
    getBiggerQueues(targetId) {
        const targetQueue = this.#getQueue(targetId);
        const returnQ = [];
        const allQueues = [...this.queues.values()];
        for (const q of allQueues) {
            if (q.getQueueSize() > targetQueue.getQueueSize()) {
                returnQ.push(q);
            }
        }
        return returnQ.sort((a, b) => a.getQueueSize() - b.getQueueSize());
    }
}
const queuesManager = new QueuesManager();
export default queuesManager;
