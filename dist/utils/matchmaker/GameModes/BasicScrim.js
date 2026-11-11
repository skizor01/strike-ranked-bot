import { read } from "node:fs";
import CommOut, { CommIn } from "../../game/comms.js";
import { adminIds, CommCode, GameAction } from "../../game/index.js";
import { findItemById, getMapData } from "../../game/utils.js";
import { makeEmbed, Utils } from "../../others.js";
import { BasicHandler } from "./Base.js";
import { GUN_EMOJIS } from "../../../config/index.js";
var PlayerState;
(function (PlayerState) {
    PlayerState["Active"] = "active";
    PlayerState["AFK"] = "afk";
    PlayerState["Spectator"] = "spectator";
})(PlayerState || (PlayerState = {}));
const GameFlags = {
    locked: 1,
    noTeamChange: 2,
    noTeamShuffle: 0,
};
const SyncRate = 10;
const FramesBetweenSyncs = Math.ceil(30 / SyncRate);
function isInsideArea(player, mapName) {
    const x = Math.floor(player.x_);
    const z = Math.floor(player.z_);
    if (mapName === "Castle") {
        const minX = 4;
        const maxX = 15;
        const minZ = 0;
        const maxZ = 14;
        if (player.team_ === 1 && x < maxX) {
            return true;
        }
        else if (player.team_ === 2 && x > minX) {
            return true;
        }
        return false;
    }
    return false;
}
class ScrimHandler extends BasicHandler {
    allPlayers;
    activePlayers;
    afkPlayers;
    gameOptions;
    killFeed;
    teamScore;
    roundStarted;
    cyTimer;
    cy = false;
    teams;
    everyoneReady = false;
    checker;
    roundStatus;
    constructor(packethandler) {
        super(packethandler);
        this.allPlayers = new Map();
        this.activePlayers = new Map();
        this.afkPlayers = new Map();
        this.gameOptions = {
            gravity: 1,
            damage: 0,
            healthRegen: 1,
            flags: 0,
            locked: false,
            noTeamChange: false,
            noTeamShuffle: false,
            weaponsDisabled: [false, false, false, false, false, false, false],
            // ak, sg, semi, rpg, p90, cs, aug
        };
        this.roundStarted = false;
        this.checker = null;
        this.roundStatus = "Waiting";
        this.killFeed = [];
        this.teams = {
            reversed: true,
            red: 0,
            blue: 0,
            1: {},
            2: {},
        };
        this.teamScore = {
            1: 0,
            2: 0,
        };
    }
    async init() { }
    async loadMapData() {
        // const [mapData, mapObj] = await getMapData(
        // 	`https://shellshock.io/maps/${this.map.filename}.json?${this.map.hash}`,
        // );
    }
    // player despawned
    handlePausePlayer() {
        try {
            let playerId = CommIn.unPackInt8U();
            let player = this.allPlayers.get(playerId);
            // console.log('pause event', player)
            if (!player)
                return;
            player.playing = false;
            player.ready = false;
            if (this.roundStarted) {
                this.sendChat(`${player.name_} despawned`);
                player.eliminated = true;
                this.checkRoundStatus();
            }
            if (player.kickTimer)
                clearTimeout(player.kickTimer);
        }
        catch (e) {
            console.log(e);
        }
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
            offsides: false,
            ready: false,
            deathTime: null,
            killedBy: null,
            bestStreak: 0,
            streak: 0,
            afkTimer: null,
            eliminated: false,
            isSpectator: false,
            state: PlayerState.Active,
        });
        const player = this.allPlayers.get(id);
        player.gameData_ = {
            mapIdx: CommIn.unPackInt8U(),
            private: CommIn.unPackInt8U(),
            gameType: CommIn.unPackInt8U(),
        };
        const item = findItemById(player.primaryWeaponItem_);
        if (item)
            player.weapon = item;
        if (this.botId === id) {
            this.allPlayers.delete(id);
            return;
        }
        this.sendChat(`${player.name_}, type r to get ready`);
        this.sendChat(`seq get out`);
        const oldPlayer = this.getAfkPlayer(player.formattedId);
        if (oldPlayer) {
            const fields = [
                "kills",
                "deaths",
                "streak",
                "bestStreak",
            ];
            //@ts-expect-error
            fields.forEach((field) => (player[field] = oldPlayer[field]));
            this.afkPlayers.delete(player.formattedId);
        }
        if (this.roundStarted) {
            player.eliminated = true;
        }
    }
    // left map
    handleRemovePlayer() {
        let playerId = CommIn.unPackInt8U();
        let player = this.allPlayers.get(playerId);
        if (!player)
            return;
        player.playing = false;
        player.ready = false;
        player.eliminated = true;
        player.state = PlayerState.AFK;
        // if (!this.afkPlayers.has(player.formattedId))
        this.afkPlayers.set(player.formattedId, player);
        this.allPlayers.delete(playerId);
        delete this.teams[player.team_][player.id_];
    }
    handleDie() {
        let killedId = CommIn.unPackInt8U();
        let byId = CommIn.unPackInt8U();
        let KilledByWeaponId = CommIn.unPackInt8U();
        let KilledByWeapon;
        let byPlayerLastDmg = CommIn.unPackInt8U();
        let killedByPlayerLastDmg = CommIn.unPackInt8U();
        let killer = this.allPlayers.get(byId);
        let killed = this.allPlayers.get(killedId);
        try {
            if (!killer || !killed)
                return;
            // Check for suicides
            if (killer !== killed) {
                killer.kills++;
                killer.streak++;
            }
            if (killer.streak > killer.bestStreak)
                killer.bestStreak = killer.streak;
            killed.deaths++;
            killed.playing = false;
            killed.ready = false;
            killed.eliminated = true;
            killed.streak = 0;
            this.addKillFeed(killer, killed);
            if (this.checker)
                clearTimeout(this.checker);
            this.checker = setTimeout(() => {
                const [team1, team2] = this.getTeams();
                const aliveBlue = team1.filter((p) => !p.eliminated);
                const aliveRed = team2.filter((p) => !p.eliminated);
                const allDead = aliveBlue.length === 0 && aliveRed.length === 0;
                const blueDead = aliveBlue.length === 0;
                const redDead = aliveRed.length === 0;
                if (!allDead)
                    this.cy = false;
                if (allDead && this.cy) {
                    // do this in case a CY happens during a CY -_-
                    this.cy = false;
                }
                if (allDead && !this.cy) {
                    this.cy = true;
                    this.sendChat("A trade occurred, time to CY!");
                    killed.eliminated = false;
                    killer.eliminated = false;
                    killed.ready = true;
                    killer.ready = true;
                    this.roundStatus = "CY";
                    if (this.cyTimer)
                        clearTimeout(this.cyTimer);
                    return;
                }
                if (!this.cy && (blueDead || redDead)) {
                    const winner = blueDead ? "Red" : "Blue";
                    this.sendChat(`${winner} team wins this round!`);
                    // console.log("reversed teams: " + this.teams.reversedTeams);
                    if (!this.teams.reversed) {
                        const teamKey = winner === "Blue" ? "blue" : "red";
                        this.teams[teamKey]++;
                    }
                    else {
                        const i = winner === "Blue" ? "red" : "blue";
                        this.teams[i]++;
                    }
                    this.sendChat(`/p Team #1: ${this.teams.red} | Team #2: ${this.teams.blue}`);
                    this.updateTeamScore(blueDead, redDead);
                    // console.log("team score: ", this.teamScore);
                    this.handleRoundEnded();
                }
                else if (aliveBlue.length === 1 && aliveRed.length === 1) {
                    this.cyTimer = setTimeout(() => {
                        this.sendChat("CY Time!");
                        this.roundStatus = "CY";
                    }, 2 * 60 * 1000);
                    this.sendChat("CY timer set to 2 minutes!");
                }
            }, 250);
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
        if (!player.isSpectator)
            player.state = PlayerState.Active;
        const isAdmin = adminIds.includes(player.formattedId);
        if (isAdmin) {
            if (command === "/reset") {
                this.resetGame();
            }
            else if (command === "/kick") {
                const playerToKick = args.join(" ");
                // console.log(playerToKick);
                this.kickPlayer(playerToKick);
            }
            else if (command === "/leave") {
                this.closeWS();
            }
        }
        switch (command) {
            case "/stats":
                var target = this.findPlayer(args.join(" ")) ?? player;
                var kd = this.getKDRatio(target);
                this.sendChat(`${target.name_}: ${target.kills}-${target.deaths} (${kd})`);
                break;
        }
        if (!player)
            return;
        if (["r", "ready"].includes(command)) {
            if (player.ready ||
                !player.playing ||
                player.isSpectator ||
                player.eliminated)
                return;
            player.ready = true;
            const [canStart, ready, notReady] = this.checkEveryoneReady();
            if (canStart === true) {
                await this.startRound();
            }
            else {
                const activePlayers = this.getActivePlayers();
                if (!this.everyoneReady && activePlayers.length >= 2) {
                    // IF EVERYONE BUT 1 PLAYER IS READY
                    if (activePlayers.length - ready.length === 1) {
                        const nrPlayer = activePlayers.find((p) => !p.playing);
                        if (!nrPlayer) {
                            console.log("player not found");
                            return;
                        }
                        if (nrPlayer.afkTimer)
                            return;
                        this.sendChat(`${nrPlayer.name_}, you have 2min to spawn`);
                        nrPlayer.afkTimer = setTimeout(async () => {
                            nrPlayer.eliminated = true;
                            nrPlayer.playing = false;
                            nrPlayer.ready = false;
                            nrPlayer.afkTimer = null;
                            nrPlayer.state = PlayerState.AFK;
                            this.afkPlayers.set(nrPlayer.formattedId, nrPlayer);
                            this.sendChat(`${nrPlayer.name_}, you have been disconnected`);
                            const [canStart, array] = this.checkEveryoneReady();
                            if (canStart === true)
                                await this.startRound();
                        }, 60_000 * 2);
                    }
                }
            }
            // await this.canStartRound();
        }
        else if (["nr", "not ready"].includes(command)) {
            player.ready = false;
            this.everyoneReady = false;
            this.sendChat(`${player.name_} set to not ready`);
        }
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
        if (!player.playing)
            player.playing = true;
        // if (!this.groupedCells) return;
        const pos = isInsideArea(player, this.map.name);
        // // console.log(pos)
        if (pos !== player.offsides)
            player.offsides = pos;
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
        if (player.isSpectator) {
            this.sendChat(`${player.name_}, you have 15s to despawn`);
            player.kickTimer = setTimeout(() => {
                this.kickPlayer(player.formattedId);
            }, 15_000);
            return;
        }
        player.state = PlayerState.Active;
        if (player.afkTimer)
            clearTimeout(player.afkTimer);
        player.afkTimer = null;
        if (this.roundStarted && player.eliminated) {
            this.sendChat(`${player.name_}, did you respawn mid-round?`);
            // player.kickTimer = setTimeout(() => {
            // 	this.kickPlayer(player.formattedId);
            // }, 15_000);
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
            }
        }
        catch (e) {
            console.log(e);
        }
    }
    handleGameActions() {
        let action = CommIn.unPackInt8U();
        const GameAction = {
            Reset: 1,
            Pause: 2,
        };
        if (action === GameAction.Reset) {
            const arr = this.getActivePlayers();
            arr.forEach((player) => {
                try {
                    // console.log(`${player.name_} marked as not ready`);
                    player.ready = false;
                    player.eliminated = false;
                }
                catch (e) {
                    console.log(e);
                }
            });
            this.cy = false;
            if (this.cyTimer)
                clearTimeout(this.cyTimer);
            this.cyTimer = null;
            this.everyoneReady = false;
        }
        // console.log(action, "game action");
    }
    handleRequestGameOptions(index) {
        // console.log("updating game options")
        if (!this.updateGameOptions_)
            return;
        const out = new CommOut();
        let flags = 0;
        if (this.gameOptions.locked)
            flags |= GameFlags.locked; // some bit stuff
        if (this.gameOptions.noTeamChange)
            flags |= GameFlags.noTeamChange;
        if (this.gameOptions.noTeamShuffle)
            flags |= GameFlags.noTeamShuffle;
        this.gameOptions.flags = flags;
        out.packInt8(CommCode.gameOptions);
        out.packInt8(this.gameOptions.gravity * 4);
        out.packInt8(this.gameOptions.damage * 4);
        out.packInt8(this.gameOptions.healthRegen * 4);
        out.packInt8(this.gameOptions.flags);
        if (index !== undefined) {
            this.gameOptions.weaponsDisabled[index] =
                !this.gameOptions.weaponsDisabled[index];
            // console.log("toggle done", index)
        }
        this.gameOptions.weaponsDisabled.forEach((v) => {
            out.packInt8(v ? 1 : 0);
        });
        out.send(this.ws);
        this.updateGameOptions_ = false;
    }
    handleRoundEnded() {
        if (this.teams.red === 6 || this.teams.blue === 6) {
            this.gameOptions.damage = 1;
            this.gameOptions.noTeamChange = false;
            this.updateGameOptions();
            this.packetHandler.sendChat("I think game has ended, if not carry on, Bye!");
            setTimeout(() => this.ws.close(), 500);
            return;
        }
        this.roundStatus = "Waiting";
        this.gameOptions.damage = 0;
        this.gameOptions.noTeamChange = false;
        // this.updateGameOptions = true;
        this.updateGameOptions();
        this.resetGame();
        this.roundStarted = false;
        this.resetFeed();
    }
    getTeams() {
        const players = [...this.allPlayers.values()];
        // console.log("players", players)
        const team1 = players.filter((player) => player.team_ === 1 && player.state === PlayerState.Active);
        const team2 = players.filter((player) => player.team_ === 2 && player.state === PlayerState.Active);
        return [team1, team2];
    }
    async startRound() {
        const [team1, team2] = this.getTeams();
        if (!team1 || !team2) {
            console.log("somethign wrng");
            return;
        }
        if (Math.abs(team1.length - team2.length) >= 2) {
            this.sendChat("A team has 2 extra players");
            return;
        }
        this.sendChat("GET READY");
        await this.sendChat("CD", 500);
        await this.sendChat("321 GO", 500);
        this.roundStarted = true;
        this.gameOptions.damage = 1;
        this.gameOptions.noTeamChange = true;
        this.teams.reversed = !this.teams.reversed;
        this.updateGameOptions();
        this.roundStatus = "Playing";
    }
    checkEveryoneReady() {
        const notReady = [];
        const ready = [];
        const weaponCount = {
            1: {
                rpg: 0,
                cs: 0,
            },
            2: {
                rpg: 0,
                cs: 0,
            },
        };
        this.everyoneReady = true;
        for (const [id, actPlayer] of this.allPlayers) {
            if (actPlayer.state === PlayerState.AFK || actPlayer.isSpectator)
                continue;
            if (!actPlayer.ready || !actPlayer.playing || actPlayer.offsides) {
                notReady.push(actPlayer);
                this.everyoneReady = false;
            }
            if (actPlayer.weapon?.formattedName === "Rpegg") {
                weaponCount[actPlayer.team_].rpg++;
            }
            else if (actPlayer.weapon?.formattedName === "Crackshot") {
                weaponCount[actPlayer.team_].cs++;
            }
            if (actPlayer.ready && !actPlayer.offsides)
                ready.push(actPlayer);
        }
        const teamViolating = weaponCount[1].rpg > 1 || weaponCount[1].cs > 3
            ? 1
            : weaponCount[2].rpg > 1 || weaponCount[2].cs > 3
                ? 2
                : undefined;
        if (this.everyoneReady && teamViolating) {
            this.sendChat(`Team ${teamViolating === 1 ? "Blue" : "Red"} is not following the gun rules`);
            // console.log("not follwoing guns")
            return [false, ready, notReady];
        }
        // console.log("checking not ready", notReady);
        if (notReady.length > 0) {
            const message = `Players not ready: ${notReady.length > 2
                ? notReady.length
                : notReady.map((p) => p.name_).join(",")}`;
            this.sendChat(message);
            // console.log("players not ready", notReady)
            return [false, ready, notReady];
        }
        if (this.everyoneReady && this.allPlayers.size < 2) {
            // console.log("not enough players", this.allPlayers.size)
            return [false, ready, notReady];
        }
        return [true, ready, notReady];
    }
    async sendChat(txt, delay = 0) {
        if (delay)
            await Utils.delay(delay);
        const out = new CommOut();
        out.packInt8(CommCode.chat);
        out.packString(txt);
        out.send(this.ws);
    }
    toggleLock() {
        this.gameOptions.locked = !this.gameOptions.locked;
        this.updateGameOptions();
    }
    resetGame() {
        let out = new CommOut();
        out.packInt8(CommCode.gameAction);
        out.packInt8(GameAction.Reset);
        out.send(this.ws);
    }
    closeWS() {
        this.resetGameOptions();
        this.ws.close();
    }
    updateGameOptions(index) {
        this.updateGameOptions_ = true;
        this.handleRequestGameOptions(index);
    }
    getActivePlayers() {
        const array = [...this.allPlayers.values()].filter((p) => p.state === PlayerState.Active);
        return array;
    }
    setSpecStatus(spectator, param) {
        const player = this.findPlayer(param);
        if (!player)
            return false;
        player.ready = false;
        if (spectator) {
            player.state = PlayerState.Spectator;
            player.isSpectator = true;
        }
        else {
            player.state = PlayerState.Active;
            player.isSpectator = false;
        }
    }
    getLiveStats() {
        const allPlayers = [...this.allPlayers.values()].toSorted((a, b) => b.kills - a.kills);
        const fields = [];
        const notReady = [];
        const obj = {
            1: {
                ready: [],
                notReady: [],
            },
            2: {
                ready: [],
                notReady: [],
            },
        };
        for (const player of allPlayers) {
            if (player.state === PlayerState.AFK || player.isSpectator)
                continue;
            if (!player.ready) {
                notReady.push(Utils.sanitiseUsername(player.name_));
                continue;
            }
            const gun = GUN_EMOJIS[player.weapon?.formattedName];
            const kdr = this.getKDRatio(player);
            const string = `${gun} ${Utils.sanitiseUsername(player.name_)} | ${player.kills}-${player.deaths} (${kdr})`;
            obj[player.team_].ready.push(string);
        }
        const reversed = this.teams.reversed;
        const team1 = reversed ? obj[1] : obj[2];
        const team2 = reversed ? obj[2] : obj[1];
        fields.push({
            name: `Team 1 - ${this.teams.red}`,
            value: team1.ready.length > 0 ? team1.ready.join("\n") : "None",
            inline: true,
        }, {
            name: `Team 2 - ${this.teams.blue}`,
            value: team2.ready.length > 0 ? team2.ready.join("\n") : "None",
            inline: true,
        });
        if (this.roundStatus === "Waiting" && false) {
            fields.push({
                name: "Not Ready",
                value: notReady.length > 0 ? notReady.join(", ") : "None",
                inline: false,
            });
        }
        else if (this.roundStatus === "Playing" && false) {
            fields.push({
                name: "Eliminated",
                value: notReady.length > 0 ? notReady.join(", ") : "None",
                inline: false,
            });
        }
        let rsValue = this.roundStatus === "Waiting"
            ? this.roundStatus + " for " + notReady.length + " players"
            : this.roundStatus;
        if (this.roundStatus === "Waiting" &&
            notReady.length <= 2 &&
            notReady.length > 0)
            rsValue += ": " + notReady.join(", ");
        fields.push({
            name: "Round Status",
            value: rsValue,
            inline: false,
        });
        if (this.roundStatus === "Playing") {
            const killFeed = this.killFeed;
            fields.push({
                name: "Kill Feed",
                value: killFeed.join("\n"),
                inline: true,
            });
        }
        return fields;
    }
    getAllPlayers() {
        const [team1, team2] = this.getTeams();
        const afk = [...this.afkPlayers.values()];
        return [...team1, ...team2, ...afk];
    }
    handleGameEnd() {
        const allPlayers = this.getAllPlayers();
        allPlayers
            .sort((a, b) => b.kills - a.kills)
            .filter((p) => p.kills > 0 || p.deaths > 0);
        if (!allPlayers || allPlayers.length === 0) {
            console.log("No players...");
            return null;
        }
        const fields = [];
        const team1 = [];
        const team2 = [];
        const reversed = this.teams.reversed;
        allPlayers.forEach((player) => {
            const kdr = player.deaths === 0 ? player.kills : player.kills / player.deaths;
            const string = `${Utils.sanitiseUsername(player.name_)} | Kills: ${player.kills} | Deaths: ${player.deaths} | KDR: ${kdr.toFixed(2)}`;
            if (reversed) {
                if (player.team_ === 1)
                    team1.push(string);
                else if (player.team_ === 2)
                    team2.push(string);
            }
            else {
                if (player.team_ === 1)
                    team2.push(string);
                else if (player.team_ === 2)
                    team1.push(string);
            }
        });
        fields.push({
            name: `Team #1 - (${this.teams.red})`,
            value: team1.join("\n"),
            inline: false,
        }, {
            name: `Team #2 - (${this.teams.blue})`,
            value: team2.join("\n"),
            inline: false,
        });
        const embed = makeEmbed(`Scrim Stats #${this.packetHandler.gameNumber}`, "normalColor", true)
            .setFields(fields)
            .setFooter({
            text: `${this.map.name} - ${Utils.getFormattedRegion(this.packetHandler.region)}`,
        })
            .setTimestamp();
        this.logPlayerIds();
        return embed;
    }
    addKillFeed(killer, killed) {
        const arr = ["eliminated", "slaughtered", "knocked off", "executed"];
        const word = Utils.returnRandomValue(arr);
        const gun1 = GUN_EMOJIS[killer.weapon?.formattedName];
        const gun2 = GUN_EMOJIS[killed.weapon?.formattedName];
        this.killFeed.push(`${gun1} **${Utils.sanitiseUsername(killer.name_)}** ${word} **${Utils.sanitiseUsername(killed.name_)}** ${gun2}`);
    }
    resetFeed() {
        this.killFeed.length = 0;
    }
    updateTeamScore(blueDead, redDead) {
        let teamid = 1;
        if (blueDead && !redDead)
            teamid = this.teams.reversed ? 1 : 2;
        if (!blueDead && redDead)
            teamid = this.teams.reversed ? 2 : 1;
        this.teamScore[teamid]++;
    }
    checkRoundStatus() {
        const [team1, team2] = this.getTeams();
        const aliveBlue = team1.filter((p) => !p.eliminated);
        const aliveRed = team2.filter((p) => !p.eliminated);
        const blueDead = aliveBlue.length === 0;
        const redDead = aliveRed.length === 0;
        if (!this.cy && (blueDead || redDead)) {
            const winner = blueDead ? "Red" : "Blue";
            this.sendChat(`${winner} team wins this round!`);
            // console.log("reversed teams: " + this.teams.reversedTeams);
            if (!this.teams.reversed) {
                const teamKey = winner === "Blue" ? "blue" : "red";
                this.teams[teamKey]++;
            }
            else {
                const i = winner === "Blue" ? "red" : "blue";
                this.teams[i]++;
            }
            this.sendChat(`/p Team #1: ${this.teams.red} | Team #2: ${this.teams.blue}`);
            this.updateTeamScore(blueDead, redDead);
            // console.log("team score: ", this.teamScore);
            this.handleRoundEnded();
        }
        else if (aliveBlue.length === 1 && aliveRed.length === 1) {
            this.cyTimer = setTimeout(() => {
                this.sendChat("CY Time!");
                this.roundStatus = "CY";
            }, 2 * 60 * 1000);
            this.sendChat("CY timer set to 2 minutes!");
        }
    }
    resetRound() {
        const players = this.getActivePlayers();
        for (const p of players) {
            p.ready = false;
            p.eliminated = false;
        }
        this.everyoneReady = false;
        this.cy = false;
        if (this.cyTimer)
            clearTimeout(this.cyTimer);
        this.cyTimer = null;
        this.roundStarted = false;
        this.roundStatus = "Waiting";
        this.gameOptions.damage = 0;
        this.gameOptions.noTeamChange = false;
        this.updateGameOptions();
    }
    disconnectPlayer(param) {
        const player = this.findPlayer(param);
        if (!player)
            return false;
        player.eliminated = true;
        player.playing = false;
        player.ready = false;
        player.afkTimer = null;
        player.state = PlayerState.AFK;
        this.afkPlayers.set(player.formattedId, player);
        this.sendChat(`${player.name_} has been forcefully disconnected`);
        return true;
    }
}
export default ScrimHandler;
