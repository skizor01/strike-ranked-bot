import { match } from "node:assert";
import WebSocket from "ws";
import CommOut, { CommIn } from "../game/comms.js";
import { CommCode } from "../game/index.js";
import ScrimHandler from "./GameModes/BasicScrim.js";
import gameManager from "../GameManager.js";
import { AttachmentBuilder, Embed, EmbedBuilder } from "discord.js";
import { makeEmbed, Utils } from "../others.js";
import { specialChannels } from "../../config/index.js";
import { KotcHandler } from "./GameModes/BasicKOTC.js";
import { LeagueKOTC } from "./GameModes/LeagueKOTC.js";
export const gameTypes = {
    SCRIM: ScrimHandler,
    KOTC: KotcHandler,
    LeagueKOTC: LeagueKOTC,
};
export default class PacketHandler {
    gameNumber;
    channel;
    packetType;
    subdomain;
    mapLink;
    uuid;
    botName;
    sessionId;
    session;
    firebaseId;
    map;
    maxPlayers;
    embed;
    region;
    team1;
    team2;
    ws;
    keepAlive;
    isGameOwner;
    botId;
    handler;
    promise;
    constructor(matchmaker, packetType) {
        this.gameNumber = matchmaker.gameNumber;
        this.channel = matchmaker.channel;
        this.packetType = packetType;
        this.subdomain = matchmaker.subdomain;
        this.mapLink = matchmaker.mapLink;
        this.uuid = matchmaker.uuid;
        this.botName = matchmaker.botName;
        this.sessionId = matchmaker.sessionId;
        this.firebaseId = matchmaker.firebaseId;
        this.session = matchmaker.session;
        this.map = matchmaker.map;
        this.maxPlayers = matchmaker.maxPlayers;
        this.embed = null;
        this.region = matchmaker.region;
        if (matchmaker.team1) {
            this.team1 = matchmaker.team1;
            this.team2 = matchmaker.team2;
        }
    }
    async init() {
        this.waitForInit();
        this.connect();
    }
    connect() {
        this.ws = new WebSocket(`wss://${this.subdomain}.yolk.life/game/${this.mapLink.split("#")[1]}`, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            },
        });
        this.ws.binaryType = "arraybuffer";
        this.ws.onopen = (e) => {
            // add dmg thingy
        };
        this.ws.onmessage = async (e) => {
            CommIn.init(e.data);
            let cmd = CommIn.unPackInt8U();
            switch (cmd) {
                case CommCode.socketReady:
                    var out = new CommOut();
                    out.packInt8(CommCode.joinGame);
                    out.packString(this.uuid);
                    out.packInt8(1); // badge
                    out.packInt8(0); // class
                    out.packString(this.botName);
                    out.packInt32(this.session);
                    out.packString(this.sessionId);
                    out.packString(this.firebaseId);
                    out.send(this.ws);
                    break;
                case CommCode.musicInfo:
                    let metaData = CommIn.unPackLongString();
                    break;
                case CommCode.gameJoined:
                    console.log("game joined", this.gameNumber);
                    this.keepAlive = setInterval(() => {
                        var out = new CommOut();
                        out.packInt8(CommCode.keepAlive);
                        out.send(this.ws);
                    }, 15e3);
                    let teamScore = [0, 0, 0];
                    let meId = CommIn.unPackInt8U();
                    let myTeam = CommIn.unPackInt8U();
                    let gameType = CommIn.unPackInt8U();
                    let mapIdx = CommIn.unPackInt8U();
                    let playerLimit = CommIn.unPackInt8U();
                    let isGameOwner = CommIn.unPackInt8U() == 1;
                    let isPrivateGame = CommIn.unPackInt8U() == 1;
                    let unkown = CommIn.unPackInt8();
                    this.isGameOwner = isGameOwner;
                    this.botId = meId;
                    const packetType = gameTypes[this.packetType];
                    this.handler = new packetType(this);
                    await this.handler.init();
                    if (this.handler instanceof LeagueKOTC) {
                        gameManager.trackLeagueGame(this.gameNumber, this);
                    }
                    else {
                        gameManager.trackGame(this.mapLink, this);
                    }
                    this.promise.resolve();
                    console.log("promise resolved");
                    this.handlePacket();
                    var out = new CommOut();
                    out.packInt8(CommCode.clientReady); // client ready
                    out.send(this.ws);
                    if (this.packetType === "SCRIM") {
                        if (this.maxPlayers < 8)
                            this.toggleWeapon(3);
                        // this.handler.gameOptions.damage = 0;
                        // this.handler.updateGameOptions()
                        return;
                    }
                    break;
                case CommCode.requestGameOptions:
                    // console.log("game options, requested", this.packetType, this.maxPlayers)
                    if (this.packetType === "SCRIM") {
                        if (this.maxPlayers < 8)
                            this.toggleWeapon(3);
                        this.handler.gameOptions.damage = 0;
                        this.handler.updateGameOptions();
                        return;
                    }
                    this.handler.handleRequestGameOptions();
                    break;
                default:
                    console.log("[PCKH WS] Unknown", cmd);
                    break;
            }
        };
        this.ws.onclose = (event) => {
            // console.log(event);
            clearInterval(this.keepAlive);
        };
    }
    handlePacket() {
        this.ws.onmessage = (e) => {
            CommIn.init(e.data);
            while (CommIn.isMoreDataAvailable()) {
                let cmd = CommIn.unPackInt8U();
                // console.log(cmd)
                try {
                    switch (cmd) {
                        case CommCode.requestGameOptions:
                            this.handler.handleRequestGameOptions();
                            break;
                        case CommCode.gameOptions:
                            this.handler.handleGameOptions();
                            break;
                        case CommCode.playerInfo:
                            this.handler.handlePlayerInfo();
                            break;
                        case CommCode.musicInfo:
                            this.handler.handleMusicInfo();
                            break;
                        case CommCode.pause:
                            this.handler.handlePausePlayer();
                            break;
                        case CommCode.eventModifier:
                            this.handler.handleEventModifier();
                            break;
                        case CommCode.clientReady:
                        case CommCode.joinGame:
                            // this.handler.handleClientReady();
                            break;
                        case CommCode.addPlayer:
                            this.handler.handleAddPlayer();
                            break;
                        case CommCode.removePlayer:
                            this.handler.handleRemovePlayer();
                            break;
                        case CommCode.spawnItem:
                            this.handler.handleSpawnItem();
                            break;
                        case CommCode.collectItem:
                            this.handler.handleCollect();
                            break;
                        case CommCode.die:
                            this.handler.handleDie();
                            break;
                        case CommCode.chat:
                            this.handler.handleChat();
                            // this.disableWeapon(5);
                            break;
                        case CommCode.metaGameState:
                            this.handler.handleMetaGame();
                            break;
                        case CommCode.syncMe:
                            this.handler.handleSyncMe();
                            break;
                        case CommCode.syncThem:
                            this.handler.handleSyncThem();
                            break;
                        case CommCode.fire:
                            this.handler.handleFire();
                            break;
                        case CommCode.melee:
                            this.handler.handleMelee();
                            break;
                        case CommCode.throwGrenade:
                            this.handler.handleGrenade();
                            break;
                        case CommCode.explode:
                            this.handler.handleExplode();
                            break;
                        case CommCode.reload:
                            this.handler.handleReload();
                            break;
                        case CommCode.swapWeapon:
                            this.handler.handleSwapGuns();
                            break;
                        case CommCode.hitMe:
                            this.handler.handleHitMe();
                            break;
                        case CommCode.hitMeHardBoiled:
                            this.handler.handleHitHB();
                            break;
                        case CommCode.hitThem:
                            this.handler.handleHitThem();
                            break;
                        case CommCode.respawn:
                            this.handler.handleRespawn();
                            break;
                        case CommCode.respawnDenied:
                            this.handler.handleRespawnDenied();
                            break;
                        case CommCode.changeCharacter:
                            this.handler.handleChangeCharacter();
                            break;
                        case CommCode.switchTeam:
                            this.handler.handleTeamSwitch();
                            break;
                        case CommCode.switchTeamFail:
                            this.handler.handleTeamSwitchFail();
                            break;
                        case CommCode.ping:
                            this.handler.handlePing();
                            break;
                        case CommCode.gameLocked:
                            this.handler.handleLock();
                            break;
                        case CommCode.updateBalance:
                            this.handler.handleUpdateBalance();
                            break;
                        case CommCode.expireUpgrade:
                            this.handler.handleExpire();
                            break;
                        case CommCode.beginShellStreak:
                            this.handler.handleBeginStreak();
                            break;
                        case CommCode.endShellStreak:
                            this.handler.handleEndStreak();
                            break;
                        case CommCode.gameAction:
                            this.handler.handleGameActions();
                            break;
                        case CommCode.challengeCompleted:
                            this.handler.handleChallengeComplete();
                            break;
                        default:
                            console.log("unknown packet 2: " + cmd);
                            break;
                    }
                }
                catch (e) {
                    console.trace(e);
                }
            }
        };
        this.ws.onclose = async (code) => {
            try {
                const embed = await this.handler.handleGameEnd();
                clearInterval(this.keepAlive);
                gameManager.stopTrackingGame(this.mapLink);
                if (!embed)
                    return;
                if (embed instanceof EmbedBuilder) {
                    try {
                        if (this.handler instanceof KotcHandler) {
                            if (this.handler.gameStartTime > 0) {
                                embed.setTimestamp(this.handler.gameStartTime);
                            }
                        }
                        await this.channel.send({ embeds: [embed] });
                        if (this.handler instanceof ScrimHandler) {
                            const scrimChannel = await Utils.getChannel("1469377229518798910");
                            if (!scrimChannel)
                                return;
                            await scrimChannel.send({ embeds: [embed] });
                        }
                    }
                    catch (e) {
                        console.log(e);
                    }
                }
                else if (embed instanceof Buffer) {
                    const att = new AttachmentBuilder(embed, { name: "image.png" });
                    await this.channel.send({ files: [att] });
                    const statsChannel = await Utils.getChannel("1271818937989988425");
                    if (statsChannel) {
                        await statsChannel.send({ files: [att] });
                    }
                }
            }
            catch (e) {
                console.trace(e);
            }
        };
    }
    sendChat(text) {
        this.handler.sendChat(text);
    }
    toggleWeapon(index) {
        this.handler.updateGameOptions(index);
    }
    toggleLock() {
        this.handler.toggleLock();
    }
    resetLobby() {
        this.handler.resetGame();
    }
    leaveLobby() {
        this.handler.closeWS();
    }
    bootPlayer(param) {
        this.handler.kickPlayer(param);
    }
    getLiveStats() {
        const fields = this.handler.getLiveStats();
        if (!fields)
            return;
        const embed = this.embed
            ? EmbedBuilder.from(this.embed)
            : makeEmbed(`Gameinfo #${this.gameNumber}`, "normalColor", false)
                .setImage(`https://shellshock.io/maps/${this.map.filename}.png`)
                .setFooter({
                text: `${this.map.name} - ${Utils.getFormattedRegion(this.region)}`,
            });
        embed.setFields(fields);
        if (this.handler instanceof KotcHandler)
            embed.setTimestamp(this.handler.gameStartTime);
        return embed;
    }
    getAllPlayers() {
        return [...this.handler.getAllPlayers()];
    }
    getConfig() {
        return this.handler.gameOptions;
    }
    setConfig(gameOptions) {
        this.handler.gameOptions = gameOptions;
        this.handler.updateGameOptions();
    }
    disconnectPlayer(param) {
        if (this.handler instanceof ScrimHandler) {
            const res = this.handler.disconnectPlayer(param);
            return res;
        }
        else {
            throw new Error("Cannot use this on non-scrim game");
        }
    }
    waitForInit() {
        return new Promise((resolve, reject) => {
            this.promise = { resolve, reject };
        });
    }
}
