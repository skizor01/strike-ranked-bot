import { RANK_ROLE_IDS } from "../config/index.js";
export const ranks = [
    { name: "Drill Legend", role: RANK_ROLE_IDS["Drill Legend"], min: 8000 },
    { name: "Grand Conqueror 3", role: RANK_ROLE_IDS["Grand Conqueror 3"], min: 7800 },
    { name: "Grand Conqueror 2", role: RANK_ROLE_IDS["Grand Conqueror 2"], min: 7400 },
    { name: "Grand Conqueror 1", role: RANK_ROLE_IDS["Grand Conqueror 1"], min: 6800 },
    { name: "Conqueror 3", role: RANK_ROLE_IDS["Conqueror 3"], min: 6200 },
    { name: "Conqueror 2", role: RANK_ROLE_IDS["Conqueror 2"], min: 5600 },
    { name: "Conqueror 1", role: RANK_ROLE_IDS["Conqueror 1"], min: 5000 },
    { name: "Ruby 3", role: RANK_ROLE_IDS["Ruby 3"], min: 4400 },
    { name: "Ruby 2", role: RANK_ROLE_IDS["Ruby 2"], min: 3900 },
    { name: "Ruby 1", role: RANK_ROLE_IDS["Ruby 1"], min: 3400 },
    { name: "Diamond 3", role: RANK_ROLE_IDS["Diamond 3"], min: 2900 },
    { name: "Diamond 2", role: RANK_ROLE_IDS["Diamond 2"], min: 2500 },
    { name: "Diamond 1", role: RANK_ROLE_IDS["Diamond 1"], min: 2100 },
    { name: "Gold 3", role: RANK_ROLE_IDS["Gold 3"], min: 1700 },
    { name: "Gold 2", role: RANK_ROLE_IDS["Gold 2"], min: 1400 },
    { name: "Gold 1", role: RANK_ROLE_IDS["Gold 1"], min: 1100 },
    { name: "Silver 3", role: RANK_ROLE_IDS["Silver 3"], min: 800 },
    { name: "Silver 2", role: RANK_ROLE_IDS["Silver 2"], min: 600 },
    { name: "Silver 1", role: RANK_ROLE_IDS["Silver 1"], min: 400 },
    { name: "Bronze 3", role: RANK_ROLE_IDS["Bronze 3"], min: 300 },
    { name: "Bronze 2", role: RANK_ROLE_IDS["Bronze 2"], min: 200 },
    { name: "Bronze 1", role: RANK_ROLE_IDS["Bronze 1"], min: 100 },
    { name: "Unranked", role: RANK_ROLE_IDS["Unranked"], min: 0 },
];
export function getRoleId(elo) {
    for (const rank of ranks) {
        if (elo >= rank.min) {
            return [rank.role, rank.name];
        }
    }
    return [RANK_ROLE_IDS.Unranked, "Unranked"];
}
