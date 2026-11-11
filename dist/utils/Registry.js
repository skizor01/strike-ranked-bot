import path from "node:path";
import fs from "node:fs";
const mapsPath = path.join(import.meta.dirname, "../", "storage", "maps.json");
const mapsKOTCPath = path.join(import.meta.dirname, "../", "storage", "mapsKOTC.json");
class Registry {
    channels;
    maps = [];
    items = [];
    currentMapPool = [];
    SCRIM_MAP;
    choices = [];
    constructor() {
        this.channels = new Map();
    }
    register(channel) {
        this.channels.set(channel.id, channel);
    }
    isRegistered(channelId) {
        return this.channels.has(channelId);
    }
    getChannel(channelId) {
        return this.channels.get(channelId);
    }
    getMaps() {
        return [...this.maps];
    }
    getCurrentMapPool() {
        return [...this.currentMapPool];
    }
    getItems() {
        return [...this.items];
    }
    getScrimMap() {
        return this.SCRIM_MAP;
    }
    setMaps(newMaps) {
        const oldMaps = this.getMaps();
        const newAdds = newMaps.filter((map) => !oldMaps.some((oldM) => map.index === oldM.index && map.name === oldM.name));
        this.maps = newMaps;
        return newAdds;
    }
    setMapPool(newPool) {
        newPool.sort((a, b) => a.index - b.index);
        this.currentMapPool = newPool;
        fs.writeFileSync(mapsKOTCPath, JSON.stringify(newPool), { encoding: "utf-8" });
    }
    setItems(newItems) {
        this.items = newItems;
    }
    setScrimMap(scrim) {
        this.SCRIM_MAP = scrim;
    }
}
const registry = new Registry();
export default registry;
