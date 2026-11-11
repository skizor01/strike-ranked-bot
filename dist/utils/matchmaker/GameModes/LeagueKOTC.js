import path from "node:path";
import { rootPath } from "../../../CustomClient.js";
import { Utils } from "../../others.js";
import { KotcHandler } from "./BasicKOTC.js";
import { loadJSONData } from "../../loadCommands.js";
import fs from "node:fs";
import { getLeagueKOTC } from "../../makeSVG.js";
import { Layer2 } from "../../../database/Layer2.js";
export class LeagueKOTC extends KotcHandler {
    team1;
    team2;
    constructor(packetHandler) {
        super(packetHandler);
        this.team1 = packetHandler.team1;
        this.team2 = packetHandler.team2;
    }
    async savePlayerStats() {
        const fileP = path.join(rootPath, "storage", "games", "league.json");
        const allData = await loadJSONData(fileP);
        const allPlayers = this.getAllPlayers()
            .filter((p) => p.totalPlayTime > 0)
            .sort((a, b) => b.kills - a.kills);
        const h2h = {};
        for (const player of allPlayers) {
            const playerTeam = player.team_;
            await Layer2.insertKOTCStats({
                kills: player.kills,
                deaths: player.deaths,
                team: playerTeam,
                weapon: player.weapon?.formattedName,
                totalcooptime: player.totalCooptime.toString(),
                totalplaytime: player.totalPlayTime.toString(),
                cap: player.CAP,
                tak: player.TAK,
                killsoncoop: player.killsOnCoop,
                deathsoncoop: player.deathsOnCoop,
                damagedealt: player.damageDealt ?? 0,
                damagetaken: player.damageTaken ?? 0,
                assists: player.assists ?? 0,
                streak: player.bestGameStreak_ ?? 0,
                deathstreak: player.bestDS ?? 0,
                game_number: this.packetHandler.gameNumber,
                name: player.name_,
            }, "league_kotc_stats");
            if (player.h2h)
                h2h[player.id_] = player.h2h;
        }
        const gameEndTime = Date.now();
        const duration = gameEndTime - this.gameStartTime;
        const [blueTeam, redTeam] = this.metaGame.getTeamScore();
        allData[this.packetHandler.gameNumber] = h2h;
        await Layer2.insertKOTC({
            blue_score: blueTeam ?? 0,
            red_score: redTeam ?? 0,
            duration,
            game_number: this.packetHandler.gameNumber
        }, "league_kotc");
        fs.writeFile(fileP, JSON.stringify(allData), (e) => console.log(e));
    }
    async handleGameEnd() {
        console.log("game ended");
        this.logPlayerIds();
        await this.savePlayerStats().catch((e) => console.trace(e));
        const img = await getLeagueKOTC(this.packetHandler.gameNumber).catch((e) => console.trace(e));
        if (img)
            return img;
    }
}
