import WebSocket from "ws";
import { Utils } from "../others.js";
import { validate } from "../wasm/wrapper.js";
import PacketHandler, { gameTypes } from "./Packethandler.js";
const botNames = [
    "Strike Stats",
];
export default class MatchMaker {
    botName;
    sessionId;
    firebaseId;
    gameNumber;
    channel;
    session;
    mapLink;
    uuid;
    subdomain;
    packetType;
    map;
    packetHandler;
    maxPlayers;
    region;
    team1;
    team2;
    ws;
    codePromise;
    constructor(obj) {
        this.botName = Utils.returnRandomValue(botNames);
        this.sessionId = obj.sessionId;
        this.firebaseId = obj.firebaseId;
        this.gameNumber = obj.gameNumber;
        this.channel = obj.channel;
        this.session = obj.session;
    }
    async init() {
        await this.connect();
        this.waitForCode();
    }
    async connect() {
        return new Promise((resolve, reject) => {
            this.ws = new WebSocket("wss://yolk.life/matchmaker/", {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
                },
            });
            this.ws.binaryType = "arraybuffer";
            this.ws.on("open", () => {
                setInterval(() => {
                    this.ws.send(JSON.stringify("ping"));
                }, 30000);
                console.log("matchmaker open");
                this.ws.send(JSON.stringify({ command: "regionList" }));
                resolve();
            });
            this.ws.on("message", async (msg) => {
                try {
                    await this.#handleMessage(msg);
                }
                catch (e) {
                    console.log(e);
                }
            });
            this.ws.on("close", () => {
                console.log("mm ws closed");
            });
            this.ws.on("error", (e) => {
                console.log("mm ws error", e);
            });
        });
    }
    createLeagueKOTC(mapObj, region, gameType, packetType, team1, team2) {
        const cmd = {
            command: "findGame",
            gameType,
            map: mapObj.index,
            noobLobby: false,
            playType: 1, // private map
            region,
            sessionId: this.sessionId,
        };
        this.ws.send(JSON.stringify(cmd));
        this.packetType = packetType;
        this.map = mapObj;
        this.region = region;
        this.team1 = team1;
        this.team2 = team2;
    }
    createMap(mapObj, region, gameType, packetType, maxPlayers) {
        const cmd = {
            command: "findGame",
            gameType,
            map: mapObj.index,
            noobLobby: false,
            playType: 1, // private map
            region,
            sessionId: this.sessionId,
        };
        this.ws.send(JSON.stringify(cmd));
        this.packetType = packetType;
        this.map = mapObj;
        this.maxPlayers = maxPlayers;
        this.region = region;
    }
    async joinMap(code) {
        // console.log("saad")
        if (code.includes("#"))
            code = code.split("#")[1];
        // console.log(code)
        const cmd = {
            command: "joinGame",
            id: code,
            observe: false,
            sessionId: this.sessionId,
        };
        this.ws.send(JSON.stringify(cmd));
        this.waitForCode();
        // this.codePromise.resolve(`https://shellshock.io/#${code}`)
    }
    async #handleMessage(msg) {
        let data = JSON.parse(msg.toString());
        // console.log(data);
        let cmd = data.command;
        switch (cmd) {
            case "regionList":
                console.log("region list received");
                break;
            case "gameFound":
                console.log("gameGound received");
                this.mapLink = `https://shellshock.io/#${data.id}`;
                this.uuid = data.uuid;
                this.subdomain = data.subdomain;
                this.codePromise.resolve(this.mapLink);
                this.packetHandler = new PacketHandler(this, this.packetType);
                this.packetHandler.init();
                this.close();
                break;
            case "notice":
                console.log("notice");
                break;
            case "validateUUID":
                const UUID = await validate(data.uuid);
                this.ws.send(JSON.stringify({ command: "validateUUID", hash: UUID }));
                break;
            default:
                console.log("[MM WS] Unknown case: ", data);
        }
    }
    async close() {
        this.ws.close();
    }
    async waitForCode() {
        return new Promise((resolve, reject) => {
            this.codePromise = { resolve, reject };
        });
    }
}