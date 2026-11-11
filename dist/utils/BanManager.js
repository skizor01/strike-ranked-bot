import { makeEmbed } from "./others.js";
import eventEmitter from "./EventEmitter.js";
import { Layer2 } from "../database/Layer2.js";
import queuesManager from "../queue/queueManager.js";
class BanManager {
    banMap = new Map();
    banChannel;
    guild;
    async queueBan(userId, ms, staffId) {
        const MAX_TIMEOUT = 2_147_483_647;
        const schedule = (remaining) => {
            const delay = Math.min(remaining, MAX_TIMEOUT);
            // console.log(delay)
            const timeout = setTimeout(async () => {
                if (remaining > MAX_TIMEOUT) {
                    console.log("recursing...", remaining - MAX_TIMEOUT);
                    schedule(remaining - MAX_TIMEOUT);
                }
                else {
                    console.log("unbanned");
                    this.banMap.delete(userId);
                    eventEmitter.emit("unbanUser", userId, "auto", staffId);
                }
            }, delay);
            this.#setBan(userId, timeout);
        };
        schedule(ms);
        const queueId = await queuesManager.checkInAnyQueue(userId);
        if (!queueId)
            return;
        eventEmitter.emit("playerLeave", queueId, userId, "queueBanned");
    }
    queueUnban(userId, staffId, reason) {
        this.#unsetBan(userId);
        console.log("event emitted");
        eventEmitter.emit("unbanUser", userId, reason, staffId);
    }
    async loadBans() {
        const data = await Layer2.getAllBans();
        const now = Date.now();
        for (const obj of data) {
            const unbanTime = new Date(obj.unban_time);
            await this.queueBan(obj.user_id, unbanTime.getTime() - now, obj.by_user);
        }
    }
    #setBan(userId, timeout) {
        const old = this.banMap.get(userId);
        if (old)
            clearTimeout(old);
        this.banMap.set(userId, timeout);
    }
    #unsetBan(userId) {
        const old = this.banMap.get(userId);
        if (old) {
            clearTimeout(old);
            this.banMap.delete(userId);
        }
    }
    setBanChannel(channel, guild) {
        this.banChannel = channel;
        this.guild = guild;
    }
    getBanChannel() {
        return this.banChannel;
    }
    getGuild() {
        return this.guild;
    }
}
const banManager = new BanManager();
export default banManager;
