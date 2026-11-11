/** @format */
import { CommIn } from "../../game/comms.js";
var MetaGameKing = class {
    ws;
    teamScore;
    players;
    formattedState;
    state;
    activeZone;
    teams;
    progress;
    numCapturing;
    constructor(ws, players) {
        this.ws = ws;
        this.teamScore = [0, 0, 0];
        this.players = players;
        this.formattedState = "Unclaimed";
    }
    unPackState() {
        ((this.state = CommIn.unPackInt8U()),
            (this.activeZone = CommIn.unPackInt8U()),
            (this.teams = CommIn.unPackInt8U()),
            (this.progress = CommIn.unPackInt16U()),
            (this.numCapturing = CommIn.unPackInt8U()),
            (this.teamScore[1] = CommIn.unPackInt8U()),
            (this.teamScore[2] = CommIn.unPackInt8U()));
        switch (this.state) {
            case coopStates.win:
                for (const player of [...this.players.values()]) {
                    if (player.isOnCoop) {
                        // Calculate the time spent in the coop
                        player.exitTime = Date.now();
                        const total = player.exitTime - player.entryTime;
                        player.totalCooptime += total;
                        // Set isOnCoop to false
                        player.isOnCoop = false;
                        console.log("updated player coop state after game ended");
                    }
                }
                this.ws.close();
                break;
            case coopStates.score: //score
                this.formattedState = "Unclaimed";
                break;
            case coopStates.takeover:
                this.formattedState = "Taking Over";
                break;
            case coopStates.capturing:
                this.formattedState = "Capturing";
                break;
            case coopStates.abandoned:
                this.formattedState = "Abandoned";
                break;
            case coopStates.contested:
                this.formattedState = "Contested";
                break;
            case coopStates.unclaimed:
                this.formattedState = "Unclaimed";
                break;
            case coopStates.start:
                this.formattedState = "Unclaimed";
                break;
        }
    }
    /**
     * Returns KOTC team scores
     * @returns team blue, team red
     */
    getTeamScore() {
        return [this.teamScore[1], this.teamScore[2]];
    }
};
export const coopStates = {
    start: 0,
    score: 1, // score
    win: 2,
    capturing: 3,
    contested: 4,
    takeover: 5,
    abandoned: 6,
    unclaimed: 7,
};
export { MetaGameKing };
