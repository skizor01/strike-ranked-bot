import CommOut, { CommIn } from "../../game/comms.js";
import { CommCode, GameAction } from "../../game/index.js";
import { findItemById, getMapData } from "../../game/utils.js";
import { Utils } from "../../others.js";
import { specialChannels } from "../../../config/index.js";
const GameFlags = {
    locked: 1,
    noTeamChange: 2,
    noTeamShuffle: 0,
};
const SyncRate = 10;
const FramesBetweenSyncs = Math.ceil(30 / SyncRate);
export class BasicHandler {
    allPlayers;
    activePlayers;
    afkPlayers;
    gameOptions;
    botId;
    map;
    ws;
    updateGameOptions_;
    packetHandler;
    maxPlayers;
    constructor(packethandler) {
        this.packetHandler = packethandler;
        this.updateGameOptions_ = true;
        this.allPlayers = new Map();
        this.activePlayers = new Map();
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
        // this.roundStarted = false;
        this.map = packethandler.map;
        this.botId = packethandler.botId;
        this.ws = packethandler.ws;
        this.maxPlayers = packethandler.maxPlayers;
    }
    async init() {
        // console.log("do something");
    }
    async loadMapData() {
        // if (this.map.filename !== "castle") return;
        // console.log("load map data");
        // const [mapData, mapObj] = await getMapData(
        //     `https://shellshock.io/maps/${this.map.filename}.json?${this.map.hash}`,
        // );
    }
    handlePlayerInfo() {
        let playerId = CommIn.unPackInt8U();
        let dbId = CommIn.unPackString(128);
        let ip = CommIn.unPackString(32);
    }
    handleMusicInfo() {
        let musicInfo = CommIn.unPackLongString();
    }
    // player despawned
    handlePausePlayer() {
        try {
            let playerId = CommIn.unPackInt8U();
            let player = this.allPlayers.get(playerId);
            if (!player)
                return;
            player.playing = false;
        }
        catch (e) {
            console.log(e);
        }
    }
    handleEventModifier() { }
    handleClientReady() { }
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
            bestStreak: 0,
            deathTime: null,
            killedBy: null,
            playing: false,
            streak: 0,
        });
        const player = this.allPlayers.get(id);
        // console.log(`${player.name_}, ${player.bestGameStreak_}, ${player.bestOverallStreak_}`);
        // console.log(player.social_, typeof player.social_)
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
        this.sendChat(`${player.name_} has joined the map`);
        this.sendChat(`seq get out`);
        // const oldPlayer = this.#getAfkPlayer(player.formattedId);
        // if (oldPlayer) {
        //     const fields = ["kills", "deaths", "streak", "bestStreak"] as const;
        //     fields.forEach((field) => (player[field] = oldPlayer[field]));
        //     this.afkPlayers.delete(player.formattedId)
        // }
    }
    handleRemovePlayer() {
        let playerId = CommIn.unPackInt8U();
        let player = this.allPlayers.get(playerId);
        if (!player)
            return;
        player.playing = false;
        this.afkPlayers.set(player.formattedId, player);
    }
    handleSpawnItem() {
        let id = CommIn.unPackInt16U();
        let kind = CommIn.unPackInt8U();
        let x = CommIn.unPackFloat();
        let y = CommIn.unPackFloat();
        let z = CommIn.unPackFloat();
    }
    handleCollect() {
        let playerId = CommIn.unPackInt8U();
        let kind = CommIn.unPackInt8U();
        let applyToWeaponIdx = CommIn.unPackInt8U();
        let id = CommIn.unPackInt16U();
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
            if (killer !== killed)
                killer.kills++;
            killer.streak++;
            if (killer.streak > killer.bestStreak)
                killer.bestStreak = killer.streak;
            killed.deaths++;
            killed.killedBy = killer.id_;
            killed.playing = false;
        }
        catch (e) {
            console.log(e);
        }
    }
    async handleChat() {
        let playerId = CommIn.unPackInt8U();
        let idk = CommIn.unPackInt8();
        let text = CommIn.unPackString()?.valueOf().toString()?.trim();
    }
    handleMetaGame() { }
    handleSyncMe() {
        let id = CommIn.unPackInt8U();
        let stateIdx = CommIn.unPackInt8U();
        let serverStateIdx = CommIn.unPackInt8U();
        let x = CommIn.unPackFloat();
        let y = CommIn.unPackFloat();
        let z = CommIn.unPackFloat();
        let climbing = CommIn.unPackInt8U();
        let rounds = CommIn.unPackInt8U();
        let store = CommIn.unPackInt8U();
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
    }
    handleFire() {
        let tv1 = { x: 0, y: 0, z: 0 };
        let tv2 = { x: 0, y: 0, z: 0 };
        let id = CommIn.unPackInt8U();
        tv1.x = CommIn.unPackFloat();
        tv1.y = CommIn.unPackFloat();
        tv1.z = CommIn.unPackFloat();
        tv2.x = CommIn.unPackFloat();
        tv2.y = CommIn.unPackFloat();
        tv2.z = CommIn.unPackFloat();
        // console.log(`fire: ${tv1.x}, ${tv1.y}, ${tv1.z}, ${tv2.x}, ${tv2.y}, ${tv2.z}`);
    }
    handleMelee() {
        let id = CommIn.unPackInt8U();
    }
    handleGrenade() {
        let id = CommIn.unPackInt8U();
        let x = CommIn.unPackFloat();
        let y = CommIn.unPackFloat();
        let z = CommIn.unPackFloat();
        let dx = CommIn.unPackFloat();
        let dy = CommIn.unPackFloat();
        let dz = CommIn.unPackFloat();
    }
    handleExplode() {
        let itemType = CommIn.unPackInt8U();
        let itemId = CommIn.unPackInt16U();
        let x = CommIn.unPackFloat();
        let y = CommIn.unPackFloat();
        let z = CommIn.unPackFloat();
        let damage = CommIn.unPackInt8U();
        let radius = CommIn.unPackFloat();
        // console.log(`explode(${itemType}): ${x}, ${y}, ${z}`);
    }
    handleReload() {
        let id = CommIn.unPackInt8U();
    }
    handleSwapGuns() {
        let id = CommIn.unPackInt8U();
        let weaponIdx = CommIn.unPackInt8U();
    }
    handleHitMe() {
        let hp = CommIn.unPackInt8U();
        let dx = CommIn.unPackFloat();
        let dz = CommIn.unPackFloat();
    }
    handleHitHB() {
        let hb = CommIn.unPackInt8U();
        let hp = CommIn.unPackInt8U();
        let dx = CommIn.unPackFloat();
        let dz = CommIn.unPackFloat();
    }
    handleHitThem() {
        let id = CommIn.unPackInt8U();
        let hp = CommIn.unPackInt8U();
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
    }
    handleRespawnDenied() { }
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
    handleTeamSwitch() {
        let id = CommIn.unPackInt8U();
        let toTeam = CommIn.unPackInt8U();
        const player = this.#getPlayerById(id);
        if (!player)
            return;
        try {
            player.team_ = toTeam;
        }
        catch (e) {
            console.log(e);
        }
    }
    handleTeamSwitchFail() { }
    handlePing() { }
    handleLock() { }
    handleUpdateBalance() {
        let newBalance = CommIn.unPackInt32U();
    }
    handleExpire() { }
    handleBeginStreak() {
        let id = CommIn.unPackInt8U();
        let ksType = CommIn.unPackInt8U();
    }
    handleEndStreak() {
        let id = CommIn.unPackInt8U();
        let ksType = CommIn.unPackInt8U();
    }
    handleGameActions() {
        let action = CommIn.unPackInt8U();
        const GameAction = {
            Reset: 1,
            Pause: 2,
        };
        if (action === GameAction.Reset) {
            [...this.allPlayers.values()].forEach((player) => {
                try {
                    player.kills = 0;
                    player.deaths = 0;
                    player.bestStreak = 0;
                    player.streak = 0;
                    player.deathTime = null;
                }
                catch (e) {
                    console.log(e);
                }
            });
        }
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
    handleGameOptions() {
        let gravity = CommIn.unPackInt8U();
        let damage = CommIn.unPackInt8U();
        let healthRegen = CommIn.unPackInt8U();
        const rawFlags = CommIn.unPackInt8U();
    }
    handleUnknown() {
        let action = CommIn.unPackInt8U();
    }
    handleChallengeComplete() {
        let unknown1 = CommIn.unPackInt8U();
        let unknown2 = CommIn.unPackInt8U();
    }
    handlePlayerRewards() {
        let unknown1 = CommIn.unPackInt8U();
        let unknown2 = CommIn.unPackInt16U();
        let unknown3 = CommIn.unPackInt24U();
    }
    handleUnknown2() {
        let unkown = CommIn.unPackString();
    }
    handleGameEnd() { }
    #getPlayerById(id) {
        return this.allPlayers.get(id);
    }
    getAllPlayers() {
        return [...this.allPlayers.values(), ...this.afkPlayers.values()];
    }
    async sendChat(txt) {
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
    resetGameOptions() {
        this.gameOptions.damage = 1;
        this.gameOptions.flags = 0;
        this.gameOptions.locked = false;
        this.gameOptions.noTeamChange = false;
        this.gameOptions.noTeamShuffle = false;
        this.updateGameOptions();
    }
    closeWS() {
        this.ws.close();
    }
    updateGameOptions(index) {
        this.updateGameOptions_ = true;
        this.handleRequestGameOptions(index);
    }
    kickPlayer(param) {
        [...this.allPlayers.values()].forEach((player) => {
            if (player.name_ === param ||
                (player.uniqueId_.startsWith(param) && param.length >= 5)) {
                const out = new CommOut();
                out.packInt8(CommCode.bootPlayer);
                out.packString(player.uniqueId_);
                out.send(this.ws);
            }
        });
    }
    /**
     * Find player based on their name or Unique ID
     * @param param Name or Unique ID
     * @returns TPlayer | undefined
     */
    findPlayer(param) {
        const player = [...this.allPlayers.values()].find((player) => player.name_ === param ||
            (player.uniqueId_.startsWith(param) && param.length >= 5));
        return player;
    }
    getLiveStats() { }
    async logPlayerIds() {
    try {
        console.log("[Game ID Logger] Function called");

        console.log("[Game ID Logger] Channel ID:", specialChannels.gameIdsLog);
        console.log("[Game ID Logger] Game number:", this.packetHandler.gameNumber);

        const allPlayers = this.getAllPlayers();
        console.log("[Game ID Logger] Players found:", allPlayers.length);

        const arr = allPlayers.map(
            player => `UID: ${player.formattedId}, name: ${player.name_}`
        );

        const logChannel = await Utils.getChannel(specialChannels.gameIdsLog);

        console.log("[Game ID Logger] Channel found:", !!logChannel);

        if (!logChannel) {
            console.error("[Game ID Logger] Could not find the log channel");
            return;
        }

        await logChannel.send(
            `Game #${this.packetHandler.gameNumber}\n${arr.length ? arr.join("\n") : "No players found."}`
        );

        console.log("[Game ID Logger] Message sent successfully");
    } catch (error) {
        console.error("[Game ID Logger] Failed:", error);
    }
}
    getAfkPlayer(id) {
        return this.afkPlayers.get(id);
    }
    getKDRatio(player) {
        const kdRatio = player.deaths === 0 ? player.kills : player.kills / player.deaths;
        return kdRatio.toFixed(2);
    }
}