import path from "node:path";
import fs from "node:fs";
import { loadJSONData } from "../utils/loadCommands.js";
import { fileURLToPath } from "node:url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let colors = {
    normalColor: 15, // Blue
    notScored: 0xfee75c, // yellow
    voided: 0xed4245, // red
    scored: 0x57f287, // green
    error: 0xed4245,
};
async function loadColors() {
    const filePath = path.join(__dirname, "colors.json");
    const data = await loadJSONData(filePath);
    // console.log(data)
    colors = {
        normalColor: Number(data.normalColor),
        notScored: Number(data.notScored),
        voided: Number(data.voided),
        scored: Number(data.scored),
        error: Number(data.error),
    };
    // const data = JSON.parse(rawData);
}
await loadColors();
export default colors;
export const StaffRoles = {
    "DRILL MANAGER": "1369986873757274122",
    "GENERAL MANAGER": "1418253774602109028",
    "REF MANAGER": "1378462493713764432",
    "EVENT MANAGER": "1421923986350014584",
    "SERVER MODERATOR": "1293337746907074663",
    "ELO MODERATOR": "1286307313296085052",
    "MATCH REFEREE": "1229817871048376350",
    "STAFF MEMBER": "1234617359264780378",
};
export const commandChannels = {
    "2v2": "1240324066292793407",
    "3v3": "1230258227573428357",
    "4v4": "1229497942407385098",
    "5v5": "1233137086027272344",
    "6v6": "1233508205070385182",
    "7v7": "1255203824801415168",
    commands: "1229497249558691911",
};
export const specialChannels = {
    linkLog: "1304173506854129794",
    register: "1422350564502798478",
    queuebanLog: "1234507860277461125",
    matchLog: "1229499783006261358",
    screenshareLog: "1337704298850680862",
    gameIdsLog: "1512296539106709625",
};
export const SPECIAL_ROLES = {
    Registered: "1357520746829840658", // 1357520746829840658
    queueBanned: "1234515926397751377",
    screenshare: "1229524062187950112",
};
export const RANK_ROLE_IDS = {
    "Drill Legend": "1438597664630378496",
    "Grand Conqueror 3": "1438597428701036555",
    "Grand Conqueror 2": "1438597260198809822",
    "Grand Conqueror 1": "1438597085950902312",
    "Conqueror 3": "1438596675722674187",
    "Conqueror 2": "1438596356787929129",
    "Conqueror 1": "1438593524873433168",
    "Ruby 3": "1438593260821151867",
    "Ruby 2": "1438593174363701412",
    "Ruby 1": "1438592637987721247",
    "Diamond 3": "1438592342356656172",
    "Diamond 2": "1438592225566130176",
    "Diamond 1": "1438591241062322187",
    "Gold 3": "1438590840523194368",
    "Gold 2": "1438590758251925554",
    "Gold 1": "1438590338645233746",
    "Silver 3": "1438590080154337320",
    "Silver 2": "1438589987808350358",
    "Silver 1": "1438589743821623476",
    "Bronze 3": "1438589564871643256",
    "Bronze 2": "1438589392133292113",
    "Bronze 1": "1438588829522067597",
    Unranked: "1357520311347843165",
};
export const GUN_EMOJIS = {
    Whipper: "<:Whipper:1530071826846449846>",
    Scrambler: "<:Scrambler:1530071769589874698>",
    FreeRanger: "<:FreeRanger:1530071942521032804>",
    Rpegg: "<:RPEGG:1530072303302606960>",
    Eggk47: "<:EggK47:1530071858987401387>",
    Crackshot: "<:cs:1530071676740567210>",
    TriHard: "<:TriHard:1530071988159381575>",
    Grenade: "<:Grenade:1530072185287217303>",
    Melee: "<:Melee:1530072143608418475>",
    Cluck9mm: "<:Pistol:1530072106098753580>",
};
export const eloChanges = {
    "2v2": [20, 10],
    "3v3": [30, 15],
    "4v4": [30, 15],
    "5v5": [40, 20],
    "6v6": [40, 20],
    "7v7": [40, 20],
};