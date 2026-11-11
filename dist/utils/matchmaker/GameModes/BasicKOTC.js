import {} from "../../../types/game.js";
import { CommIn } from "../../game/comms.js";
import { adminIds, GameAction } from "../../game/index.js";
import { DmgType, findItemById, getMapData, groupAdjacentCells } from "../../game/utils.js";
import { makeEmbed, Utils } from "../../others.js";
import { coopStates, MetaGameKing } from "../MetaGame/kotc.js";
import { BasicHandler } from "./Base.js";
import { GUN_EMOJIS } from "../../../config/index.js";
import path from "node:path";
import fs from "node:fs";
import { rootPath } from "../../../CustomClient.js";
import { loadJSONData } from "../../loadCommands.js";
import { getKotcImage } from "../../makeSVG.js";
import { Layer2 } from "../../../database/Layer2.js";
function isPlayerInActiveZone(player, activeZone) {
    return activeZone.some((cell) => cell.x === Math.floor(player.x_) &&
        cell.y === Math.floor(player.y_) &&
        cell.z === Math.floor(player.z_));
}
const SyncRate = 10;
const FramesBetweenSyncs = Math.ceil(30 / SyncRate);
export class KotcHandler extends BasicHandler {
    allPlayers;
    afkPlayers;
    server;
    gameStartTime;
    killSteps;
    timeSteps;
    topKills;
    topDeaths;
    groupedCells;
    metaGame;
    mapData;
    constructor(packetHandler) {
        super(packetHandler);
        this.allPlayers = new Map();
        this.afkPlayers = new Map();
        this.gameOptions = {
            gravity: 1,
            damage: 1,
            healthRegen: 1,
            flags: 0,
            locked: false,
            noTeamChange: false,
            noTeamShuffle: false,
            weaponsDisabled: [false, false, false, false, false, false, false],
            // ak, sg, semi, rpg, p90, cs, aug
        };
        this.map = packetHandler.map;
        this.server = packetHandler.region;
        this.killSteps = 10;
        this.timeSteps = 1 * 60 * 1000;
        this.topKills = 0;
        this.topDeaths = 0;
        this.gameStartTime = 0;
        this.metaGame = new MetaGameKing(this.ws, this.allPlayers);
    }
    async init() {
        await this.loadMapData();
    }
    async loadMapData() {
        const [mapData, obj] = await getMapData(`https://shellshock.io/maps/${this.map.filename}.json?${this.map.hash}`);
        this.groupedCells = groupAdjacentCells(mapData);
        this.mapData = obj;
    }
    handleAddPlayer() {
        let id = CommIn.unPackInt8U(); // players in lobby
        let uniqueId = CommIn.unPackString().toString();
        let name = CommIn.unPackString().toString();
        let newString = CommIn.unPackString();
        let charClass = CommIn.unPackInt8U();
        let formattedId = uniqueId.slice(0, 10);
        this.allPlayers.set(id, {
            id_: id,
            formattedId,
            uniqueId_: uniqueId,
            name_: name,
            team_: CommIn.unPackInt8U(),
            primaryWeaponItem_: CommIn.unPackInt16U(),
            secondaryWeaponItem_: CommIn.unPackInt16U(),
            shellColor_: CommIn.unPackInt8U(),
            hatItem_: CommIn.unPackInt16U(),
            stampItem_: CommIn.unPackInt16U(),
            grenadeItem_: CommIn.unPackInt8(),
            meleeItem_: CommIn.unPackInt8(),
            unknown1: CommIn.unPackInt16U(),
            unknown2: CommIn.unPackInt16U(),
            x_: CommIn.unPackFloat(),
            y_: CommIn.unPackFloat(),
            z_: CommIn.unPackFloat(),
            dx_: CommIn.unPackFloat(),
            dy_: CommIn.unPackFloat(),
            dz_: CommIn.unPackFloat(),
            yaw_: CommIn.unPackRadU(),
            pitch_: CommIn.unPackRad(),
            score_: CommIn.unPackInt32U(),
            kills: CommIn.unPackInt16U(),
            deaths: CommIn.unPackInt16U(),
            streak_: CommIn.unPackInt16U(),
            totalKills_: CommIn.unPackInt32U(),
            totalDeaths_: CommIn.unPackInt32U(),
            bestGameStreak_: CommIn.unPackInt16U(),
            bestOverallStreak_: CommIn.unPackInt16U(),
            shield_: CommIn.unPackInt8U(),
            hp_: CommIn.unPackInt8U(),
            playing_: CommIn.unPackInt8U(),
            weaponIdx_: CommIn.unPackInt8U(),
            controlKeys_: CommIn.unPackInt8U(),
            upgradeProductId_: CommIn.unPackInt8U(),
            activeShellStreaks_: CommIn.unPackInt8U(),
            social_: CommIn.unPackLongString().toString(),
            hideBadge_: CommIn.unPackInt8U(),
            playing: false,
            deathTime: null,
            killedBy: null,
            bestStreak: 0,
            streak: 0,
            assists: 0,
            bestDS: 0,
            CAP: 0,
            damageDealt: 0,
            damageTaken: 0,
            deathsOnCoop: 0,
            deathStreak: 0,
            killsOnCoop: 0,
            isOnCoop: false,
            lastDespawnTime: 0,
            lastSpawnTime: 0,
            prevState: "",
            recentDamage: [],
            TAK: 0,
            totalCooptime: 0,
            noSpawnWarningsTracker: 0,
            spawnKills: 0,
            totalPlayTime: 0,
            noSpawnWarning: null,
        });
        const player = this.allPlayers.get(id);
        player.gameData_ = {
            mapIdx: CommIn.unPackInt8U(),
            private: CommIn.unPackInt8U(),
            gameType: CommIn.unPackInt8U(),
        };
        player.h2h = {
            name: player.name_,
            kills: {},
            deaths: {},
        };
        const item = findItemById(player.primaryWeaponItem_);
        if (item)
            player.weapon = item;
        if (this.botId === id) {
            this.allPlayers.delete(id);
            return;
        }
        const fieldsToRestore = [
            "kills",
            "deaths",
            "totalCooptime",
            "h2h",
            "killsOnCoop",
            "deathsOnCoop",
            "TAK",
            "CAP",
            "damageDealt",
            "damageTaken",
            "assists",
            "streak_",
            "bestGameStreak_",
            "deathStreak",
            "bestDS",
            "noSpawnWarningsTracker",
            "spawnKills",
            "totalPlayTime",
        ];
        const oldPlayer = this.getAfkPlayer(player.formattedId);
        if (oldPlayer) {
            fieldsToRestore.forEach((field) => {
                player[field] = oldPlayer[field];
            });
        }
        if (this.gameStartTime) {
            this.sendChat(`${player.name_} joined the game.`);
        }
    }
    handlePausePlayer() {
        try {
            let playerId = CommIn.unPackInt8U();
            let player = this.allPlayers.get(playerId);
            if (!player)
                return;
            player.playing = false;
            player.lastDespawnTime = Date.now();
            player.totalPlayTime += player.lastDespawnTime - player.lastSpawnTime;
            if (player.isOnCoop) {
                this.updateCoopTime(player);
            }
            this.noSpawnTracker(player);
        }
        catch (e) {
            console.log(e);
        }
    }
    handleRemovePlayer() {
        try {
            let playerId = CommIn.unPackInt8U();
            let player = this.allPlayers.get(playerId);
            if (!player)
                return;
            player.playing = false;
            if (player.isOnCoop) {
                this.updateCoopTime(player);
                // player.totalPlayTime += player.lastDespawnTime - player.lastSpawnTime;s
                player.isOnCoop = false;
            }
            if (this.gameStartTime) {
                this.sendChat(`${player.name_} left the game (${player.weapon?.formattedName})`);
            }
            player.streak = 0;
            this.afkPlayers.set(player.formattedId, player);
            this.allPlayers.delete(player.id_);
        }
        catch (e) {
            console.trace(e);
        }
    }
    handleDie() {
        let killedId = CommIn.unPackInt8U();
        let byId = CommIn.unPackInt8U();
        let timeUntilRespawn = CommIn.unPackInt8U();
        let KilledByWeapon;
        let byPlayerLastDmg = CommIn.unPackInt8U();
        let killedByPlayerLastDmg = CommIn.unPackInt8U(); // what weapon killed the player
        let killer = this.allPlayers.get(byId);
        let killed = this.allPlayers.get(killedId);
        if (!killer || !killed)
            return;
        try {
            if (killer !== killed) {
                killer.kills++;
                killer.streak++;
                killer.deathStreak = 0;
            }
            killed.deaths++;
            killed.playing = false;
            killed.lastDespawnTime = Date.now();
            killed.totalPlayTime += killed.lastDespawnTime - killed.lastSpawnTime;
            if (killer.streak > killer.bestStreak)
                killer.bestStreak = killer.streak;
            if (killed.streak === 0)
                killed.deathStreak++;
            if (killed.deathStreak > killed.bestDS)
                killed.bestDS = killed.deathStreak;
            if (killer.kills === this.killSteps) {
                const kdRatio = this.getKDRatio(killer);
                this.sendChat(`${killer.name_} reached ${this.killSteps} kills! - (${kdRatio})`);
                this.killSteps += 10;
            }
            const weaponName = DmgType[killedByPlayerLastDmg]?.name;
            if (weaponName && weaponName !== "Fall") {
                this.updateH2HStats(killer, killed.name_, "kills", weaponName);
                this.updateH2HStats(killed, killer.name_, "deaths", weaponName);
            }
            if (killer.isOnCoop || killed.isOnCoop)
                killer.killsOnCoop++;
            if (killed.isOnCoop) {
                // console.log("died on coop")
                killed.deathsOnCoop++;
                this.updateCoopTime(killed);
            }
            this.noSpawnTracker(killed);
            const topKills = this.allPlayers.get(this.topKills);
            const topDeaths = this.allPlayers.get(this.topDeaths);
            if (topKills) {
                if (killer.kills > topKills.kills)
                    this.topKills = killer.id_;
            }
            else
                this.topKills = killer.id_;
            if (topDeaths) {
                if (killed.deaths > topDeaths.deaths)
                    this.topDeaths = killed.deaths;
            }
            else
                this.topDeaths = killed.deaths;
            const now = Date.now();
            if (now - killed.lastSpawnTime < 1800) {
                killer.spawnKills++;
            }
        }
        catch (e) {
            console.log(e);
        }
    }
    async handleChat() {
        let playerId = CommIn.unPackInt8U();
        let idk = CommIn.unPackInt8();
        let text = CommIn.unPackString()?.valueOf().toString()?.trim();
        const args = text.split(/\s+/);
        const command = args.shift()?.toLowerCase();
        const player = this.allPlayers.get(playerId);
        if (!player)
            return;
        const isAdmin = adminIds.includes(player.formattedId);
        if (isAdmin) {
            if (command === "/reset") {
                this.resetGame();
            }
            else if (command === "/boot") {
                const playerToKick = args.join(" ");
                this.kickPlayer(playerToKick);
            }
            else if (command === "/lu") {
                this.toggleLock();
            }
            else if (command === "/leavee") {
                this.closeWS();
            }
        }
        switch (command) {
            case "/stats":
            case "=stats":
            case "!stats":
            case "/s":
             
                var target = this.findPlayer(args.join(" ")) ?? player;
                var kd = this.getKDRatio(target);
                this.sendChat(`${target.name_}'s K: ${target.kills} D: ${target.deaths} KDR: (${kd})`);
                break;
            case "/time":
            case "=time":
            case "!time":
            case "/t":
                var target = this.findPlayer(args.join(" ")) ?? player;
                var time = Utils.formatTime(target.totalCooptime, { separator: " ", showUnits: true });
                this.sendChat(`${target.name_}'s TOP: ${time} CAP: ${target.CAP} TAK: ${target.TAK}`);
                break;
        }
    }
    handleMetaGame() {
        this.metaGame.unPackState();
    }
    handleSyncThem() {
        let id = CommIn.unPackInt8U();
        let x = CommIn.unPackFloat();
        let y = CommIn.unPackFloat();
        let z = CommIn.unPackFloat();
        let climbing = CommIn.unPackInt8U();
        let player = this.allPlayers.get(id);
        if (!player || player.id_ === 0) {
            for (let i2 = 0; i2 < FramesBetweenSyncs; i2++) {
                CommIn.unPackInt8U();
                CommIn.unPackRadU();
                CommIn.unPackRad();
                CommIn.unPackInt8U();
            }
            return;
        }
        for (let i2 = 0; i2 < FramesBetweenSyncs; i2++) {
            let one = CommIn.unPackInt8U();
            let two = CommIn.unPackRadU();
            let three = CommIn.unPackRad();
            let scale = CommIn.unPackInt8U() / 100;
        }
        player.x_ = x;
        player.y_ = y;
        player.z_ = z;
        // Decided to remove this line for the reason explained below
        // It will now fully rely on Respawn Packet
        // I SHOULD HAVE DONE THIS FROM THE BEGINNING
        // if (!player.playing) player.playing = true;
        // in case you are wondering why i added this
        // FKING SHELL SHOCKER SENDS A SINGLE FKING SYNCTHEM EVENT WHEN A PLAYER DIES
        // THIS THEN FKING COUNTS THE PLAYER AS ALIVE AND SETS THEIR player.onCoop TO TRUE (if they die on coop)
        if (!player.playing)
            return;
        try {
            if (this.metaGame.state === coopStates.score && player.isOnCoop) {
                player.CAP++;
            }
            if (this.metaGame.activeZone === 0) {
                if (player.isOnCoop) {
                    this.updateCoopTime(player);
                }
                return;
            }
            let onCoop = isPlayerInActiveZone(player, this.groupedCells[this.metaGame.activeZone - 1]);
            // if (onCoop !== player.isOnCoop) {
            // 	console.log(`player = ${player.isOnCoop} | ${onCoop}`)
            // }
            if (onCoop && !player.isOnCoop) {
                if (this.gameStartTime === 0) {
                    this.gameStartTime = Date.now();
                }
                player.isOnCoop = true;
                player.entryTime = Date.now();
            }
            else if (!onCoop && player.isOnCoop) {
                this.updateCoopTime(player);
            }
            if (player.isOnCoop) {
                if (this.metaGame.state === coopStates.takeover &&
                    player.prevState !== "takeover") {
                    // console.log(`${player.name_} is taking over ${player.isOnCoop}`);
                    player.prevState = "takeover";
                }
                else if (this.metaGame.state === coopStates.capturing &&
                    player.prevState !== "capturing") {
                    // console.log(`${player.name_} is capturing ${player.isOnCoop}`);
                    if (player.prevState === "takeover") {
                        player.TAK += 1;
                        // console.log('increased takeovers');
                    }
                    player.prevState = "capturing";
                }
            }
            else {
                if (this.metaGame.state === coopStates.abandoned &&
                    player.prevState !== "abandoned") {
                    player.prevState = "abandoned";
                }
            }
        }
        catch (e) {
            console.trace(e);
        }
    }
    handleChangeCharacter() {
        let id = CommIn.unPackInt8U();
        let classIdx = CommIn.unPackInt8U();
        let primaryWeaponIdx = CommIn.unPackInt16U(); // skin id
        let secondaryWeaponIdx = CommIn.unPackInt16U();
        let shellColor = CommIn.unPackInt8U();
        let hatIdx = CommIn.unPackInt16U();
        let stampIdx = CommIn.unPackInt16U();
        let grenadeIdx = CommIn.unPackInt16U();
        let meleeIdx = CommIn.unPackInt16U();
        let unknown1 = CommIn.unPackInt8();
        let unknown2 = CommIn.unPackInt8();
        try {
            let player = this.allPlayers.get(id);
            if (!player)
                return;
            const newWeapon = findItemById(primaryWeaponIdx);
            const oldWeapon = player.weapon;
            if (!newWeapon || !oldWeapon)
                return;
            if (newWeapon.formattedName !== oldWeapon.formattedName) {
                player.primaryWeaponItem_ = primaryWeaponIdx;
                player.weapon = newWeapon;
                if (this.gameStartTime > 0) {
                    this.sendChat(`${player.name_} swapped from (${oldWeapon.formattedName}) to (${newWeapon.formattedName})`);
                }
            }
        }
        catch (e) {
            console.trace(e);
        }
    }
    handleRespawn() {
        let id = CommIn.unPackInt8U();
        let seed = CommIn.unPackInt16U();
        let x = CommIn.unPackFloat();
        let y = CommIn.unPackFloat();
        let z = CommIn.unPackFloat();
        let rounds0 = CommIn.unPackInt8U();
        let store0 = CommIn.unPackInt8U();
        let rounds1 = CommIn.unPackInt8U();
        let store1 = CommIn.unPackInt8U();
        let grenades = CommIn.unPackInt8U();
        let player = this.allPlayers.get(id);
        if (!player)
            return;
        player.playing = true;
        player.lastSpawnTime = Date.now();
        this.noSpawnTracker(player);
    }
    handleGameActions() {
        let action = CommIn.unPackInt8U();
        if (action === GameAction.Reset) {
            for (const player of [...this.allPlayers.values()]) {
                player.kills = 0;
                player.deaths = 0;
                player.totalCooptime = 0;
                player.CAP = 0;
                player.TAK = 0;
                player.bestDS = 0;
                player.bestStreak = 0;
                player.deathStreak = 0;
                player.deathsOnCoop = 0;
                player.killsOnCoop = 0;
                player.spawnKills = 0;
                player.noSpawnWarningsTracker = 0;
                player.noSpawnWarning = null;
                player.damageDealt = 0;
                player.damageTaken = 0;
                player.recentDamage = [];
                player.assists = 0;
                player.exitTime = 0;
                player.entryTime = 0;
                player.playing = false;
                player.prevState = "";
                player.deathTime = null;
                player.streak = 0;
                player.isOnCoop = false;
                player.lastDespawnTime = 0;
                player.lastSpawnTime = 0;
                player.totalPlayTime = 0;
                player.h2h = {
                    name: player.name_,
                    kills: {},
                    deaths: {},
                };
                this.topDeaths = 0;
                this.topKills = 0;
                this.gameStartTime = 0;
                this.killSteps = 10;
                this.timeSteps = 1 * 60 * 1000;
            }
        }
    }
    getLiveStats() {
        const allPlayers = [...this.allPlayers.values()].filter((player) => player.kills > 0 || player.deaths > 0);
        allPlayers.sort((a, b) => b.kills - a.kills);
        const totalProgressLength = 15;
        const progress = this.metaGame.progress;
        const [blueSCore, redScore] = this.metaGame.getTeamScore();
        const progressPercentage = Math.floor((progress / 1200) * 100);
        const formattedState = this.metaGame.formattedState;
        const numCapturing = this.metaGame.numCapturing;
        const rawFilledLength = Math.round((progress / 1200) * totalProgressLength);
        const filledLength = Math.max(0, Math.min(totalProgressLength, rawFilledLength)); // calculate the '-' number
        const capTeam = this.metaGame.teams === 1 ? "🔵" : "🔴";
        const progressBar = `[${"#".repeat(filledLength)}${"-".repeat(totalProgressLength - filledLength)}] ${progressPercentage}% (${numCapturing}x) ${capTeam}`;
        const team1 = [];
        const team2 = [];
        // team1.push("")
        for (const player of allPlayers) {
            const kd = this.getKDRatio(player);
            const gun = GUN_EMOJIS[player.weapon?.formattedName ?? "Eggk47"];
            const coopTime = Utils.formatTime(player.totalCooptime, { showUnits: true, separator: " " });
            const spawned = player.playing;
            const statString = `${Utils.sanitiseUsername(player.name_)} | ${player.kills}-${player.deaths} (${kd}) | ${coopTime}`;
            let string;
            string = `${gun} ${statString}`;
            if (player.team_ === 1)
                team1.push(string);
            else if (player.team_ === 2)
                team2.push(string);
        }
        const fields = [];
        fields.push({
            name: `Progress (${formattedState})`,
            value: `${progressBar}`,
            inline: false,
        }, {
            name: `Blue ${blueSCore}`,
            value: team1.length > 0 ? team1.join("\n") : "None",
            inline: true,
        }, {
            name: `Red ${redScore}`,
            value: team2.length > 0 ? team2.join("\n") : "None",
            inline: true,
        });
        if (this.gameStartTime > 0) {
            fields.push({
                value: `Started <t:${Math.floor(this.gameStartTime / 1000)}:R>`,
                name: " ",
                inline: false
            });
        }
        return fields;
    }
    async handleGameEnd() {
        console.log("game ended");
        this.logPlayerIds();
        await this.savePlayerStats().catch((e) => console.trace(e));
        const img = await getKotcImage(this.packetHandler.gameNumber).catch((e) => console.trace(e));
        return img;
    }
    async savePlayerStats() {
        const fileP = path.join(rootPath, "storage", "games", "server.json");
        const allData = await loadJSONData(fileP);
        const allPlayers = this.getAllPlayers()
            .filter((p) => p.totalPlayTime > 0)
            .sort((a, b) => b.kills - a.kills);
        const h2h = {};
        for (const player of allPlayers) {
            const playerTeam = player.team_;
            if (player.playing)
                player.totalPlayTime += Date.now() - player.lastSpawnTime;
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
                user_id: ""
            }, "server_kotc_stats");
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
            duration: duration,
            game_number: this.packetHandler.gameNumber
        }, "server_kotc");
        fs.writeFile(fileP, JSON.stringify(allData), (e) => console.log(e));
    }
    updateCoopTime(player) {
        player.isOnCoop = false;
        player.exitTime = Date.now();
        const total = player.exitTime - player.entryTime;
        player.totalCooptime += total;
        if (player.totalCooptime >= this.timeSteps) {
            const time = Utils.formatTime(player.totalCooptime, { showUnits: false, separator: ":" });
            this.sendChat(`${player.name_} has the most TOP : (${time})`);
            this.timeSteps += 60_000;
        }
    }
    updateH2HStats(player, killedName, statType, weaponName) {
        if (!player.h2h[statType][killedName]) {
            player.h2h[statType][killedName] = {};
        }
        if (!player.h2h[statType][killedName][weaponName]) {
            player.h2h[statType][killedName][weaponName] = 0;
        }
        player.h2h[statType][killedName][weaponName]++;
    }
    noSpawnTracker(player, cycle = 30 * 1000) {
        if (this.gameStartTime === 0)
            return;
        if (player.playing) {
            if (player.noSpawnWarning)
                clearTimeout(player.noSpawnWarning);
            if (player.noSpawnWarningsTracker > 0) {
                const now = Date.now();
                const diff = now - player.lastDespawnTime;
                const time = Utils.formatTime(diff, { showUnits: false, separator: ":" });
                this.sendChat(`${player.name_} spawned after ${time}m`);
            }
            player.noSpawnWarning = null;
            player.noSpawnWarningsTracker = 0;
            player.lastSpawnTime = Date.now();
            return;
        }
        if (player.noSpawnWarning)
            clearTimeout(player.noSpawnWarning);
        if (player.lastSpawnTime === 0)
            player.lastDespawnTime = Date.now();
        player.noSpawnWarning = setTimeout(() => {
            if (this.afkPlayers.has(player.formattedId))
                return;
            this.sendChat(`${player.name_} hasn't spawned for ${Math.floor(cycle / 1000)}s`);
            player.noSpawnWarningsTracker++;
            this.noSpawnTracker(player, cycle + 30 * 1000);
        }, 30 * 1000);
    }
}