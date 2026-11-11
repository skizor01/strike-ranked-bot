import { map } from "firebase/firestore/pipelines";
import { Errors } from "../types/errors.js";
import PacketHandler from "./matchmaker/Packethandler.js";
class GameManager {
    processes;
    serverGames;
    leagueGames;
    constructor() {
        this.processes = new Map();
        this.serverGames = new Map();
        this.leagueGames = new Map();
    }
    start(gameNumber, gameData) {
        if (this.processes.has(gameNumber))
            throw new Error(Errors.processInProgress);
        this.processes.set(gameNumber, gameData);
    }
    stop(gameNumber) {
        if (this.processes.has(gameNumber))
            this.processes.delete(gameNumber);
    }
    startShuffle(gameNumber, game) {
        if (this.processes.has(gameNumber))
            throw new Error(Errors.shuffleInProgress);
        this.processes.set(gameNumber, game);
    }
    stopShuffle(gameNumber) {
        if (this.processes.has(gameNumber))
            this.processes.delete(gameNumber);
    }
    trackGame(link, packet) {
        this.serverGames.set(link, packet);
    }
   trackLeagueGame(id, packet) {
    this.leagueGames.set(Number(id), packet);
}

   getLeagueGame(id) {
    return this.leagueGames.get(Number(id));
}
    stopTrackingGame(link) {
        this.serverGames.delete(link);
    }
    getGame(link) {
        return this.serverGames.get(link);
    }
}
const gameManager = new GameManager();
export default gameManager;