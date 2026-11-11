import {} from "../types/database.js";
import Database from "./index.js";
import { QueueClass } from "../queue/queue.js";
import { Errors } from "../types/errors.js";
import { getRoleId } from "../utils/getRoleId.js";
import { eloChanges } from "../config/index.js";
import { Utils } from "../utils/others.js";
import { ref } from "node:process";
export class Layer2 {
    static async getUserWeeklyData(userId) {
        const res = await Database.getWeeklyData(userId);
        // console.log(res);
        if (!res)
            return undefined;
        return res[0];
    }
    static async getUserSeasonStats(userId, currentSSn, season) {
        const res = await Database.getUserStats(userId, currentSSn, season);
        // console.log(res[0]);
        if (!res)
            return undefined;
        return res[0];
    }
    static async getUserAdvancedStats(userId) {
        const queueStats = await Database.getUserQueueStats(userId);
        const overallStats = await Database.getUserOverallStats(userId);
        return [queueStats, overallStats[0]];
    }
    static async getLeaderboard(lbMode, mode, page, currentSSn = true) {
        if (lbMode === "user_stats") {
            const res = await Database.getLeaderboard(mode, page - 1, currentSSn);
            return res;
        }
        const res = await Database.getWeeklyLb(mode, page - 1);
        // console.log(res);
        return res;
    }
    static async getSeasons() {
        const res = await Database.getAllSeasons();
        return res;
    }
    static async getRecentGameData(offset, queueType, gameNumber) {
        if (offset) {
            return (await Database.getRecentGameData(offset - 1))[0];
        }
        else if (queueType) {
            return (await Database.getGameDataByQueue(queueType))[0];
        }
        else if (gameNumber) {
            return (await Database.getGameDataByNumber(gameNumber))[0];
        }
    }
    static async getRecentUserGames(userId, page, howFar) {
        const data = await Database.getGameDataByUser(userId, page, howFar);
        return data;
    }
    static async getRefStats(userId) {
        const stats = await Database.getRefStats(userId);
        return stats;
    }
    // static async getBanDetails(targetId: string, bool?: true) : Promise<BanDetails>
    static async getBanDetails(targetId) {
        const details = await Database.getBanDetails(targetId);
        return details;
    }
    static async getPendingGames(howFar) {
        return Database.checkPendingGames(howFar);
    }
    static async RegisterUser(userId, username) {
        const isRegisterd = await Database.isUserRegistered(userId);
        if (isRegisterd)
            throw new Error(Errors.alreadyRegistered);
        const [rankId, rankName] = getRoleId(0);
        await Database.registerUser(userId, Utils.sanitiseUsername(username), rankId);
        return { successful: true };
    }
    /**
     *
     * @param allPlayers
     * @param gameNumber
     * @returns [cap1, cap2, remaininPlayers]
     */
    static async shuffleGame(allPlayers, gameNumber, votes) {
        const oldGame = await Database.getGameDataByNumber(gameNumber);
        if (oldGame[0]?.status !== "Picking")
            throw new Error(Errors.invalidGame);
        const newArray = Utils.shuffleArray(allPlayers);
        const newCap1 = newArray.shift();
        const newCap2 = newArray.shift();
        const newRemaining = newArray;
        const res = await Database.shuffleGame(newCap1, newCap2, newRemaining, gameNumber, votes, true);
        if (res)
            return [newCap1, newCap2, newRemaining];
        else
            return false;
    }
    static async isUserBanned(userId) { }
    // SETTERS
    static async insertGame(players, queueType, captain1, captain2) {
        const gameNumber = await Database.insertInitialGameData(players, queueType, captain1, captain2);
        return gameNumber;
    }
    static async pickPlayers(pick2_players, current_picks, current_captains_turn, status, gameNumber, team1, team2) {
        await Database.pickPlayers(pick2_players, current_picks, current_captains_turn, status, gameNumber, team1, team2);
    }
    static async processGame(action, team1Players, team2Players, gameNumber, queueType, staffId, winner) {
        const usersMap = new Map();
        if (action === "score" && winner) {
            await Database.scoreGame(winner, gameNumber, staffId);
            const refStats = await Database.getRefStats(staffId);
            if (refStats) {
                await Database.updateRefStats(staffId, {
                    ...refStats,
                    calls: (refStats.calls ?? 1) + 1,
                });
            }
            const winnerTeam = winner === 1 ? team1Players : team2Players;
            const loserTeam = winner === 2 ? team1Players : team2Players;
            const [winElo, loseElo] = eloChanges[queueType];
            const team1Promise = winnerTeam.map(async (id) => {
                const userStats = (await Database.getUserStats(id, true))[0];
                const newElo = userStats.elo + winElo;
                const newWins = userStats.wins + 1;
                const updates = {
                    elo: newElo,
                    wins: newWins,
                    games_played: userStats.games_played + 1,
                    wlr: (userStats.losses ? newWins / userStats.losses : newWins).toFixed(2),
                };
                const [rankId, rankName] = getRoleId(newElo);
                updates.rank_id = rankId;
                updates.rank = rankName;
                await Database.updateUserStats(userStats, updates);
                usersMap.set(id, {
                    oldRankId: userStats.rank_id,
                    newRankId: rankId,
                    newElo,
                    oldElo: userStats.elo,
                });
            });
            const team2Promise = loserTeam.map(async (id) => {
                const userStats = (await Database.getUserStats(id, true))[0];
                const newElo = Math.max(userStats.elo - loseElo, 0);
                const newLosses = userStats.losses + 1;
                const updates = {
                    elo: newElo,
                    losses: newLosses,
                    games_played: userStats.games_played + 1,
                    wlr: (newLosses ? userStats.wins / newLosses : userStats.wins).toFixed(2),
                };
                const [rankId, rankName] = getRoleId(newElo);
                updates.rank_id = rankId;
                updates.rank = rankName;
                await Database.updateUserStats(userStats, updates);
                usersMap.set(id, {
                    oldRankId: userStats.rank_id,
                    newRankId: rankId,
                    newElo,
                    oldElo: userStats.elo,
                });
            });
            await Promise.allSettled([...team1Promise, ...team2Promise]);
            return {
                type: action,
                winnerTeam,
                loserTeam,
                usersMap,
            };
        }
        else if (action === "void") {
            // console.log("handle database")
            const res = await Database.voidGame(gameNumber, staffId);
            const refStats = await Database.getRefStats(staffId);
            if (refStats) {
                await Database.updateRefStats(staffId, {
                    ...refStats,
                    voids: (refStats.voids ?? 1) + 1,
                });
            }
            if (res)
                return { type: action };
        }
        else if (action === "undo") {
            let newStatus;
            let perTeam = parseInt(queueType);
            if (perTeam === team1Players.length)
                newStatus = "Not Called";
            else
                newStatus = "Picking";
            await Database.undoGame(gameNumber, newStatus, staffId);
            if (winner) {
                const winnerTeam = winner === 1 ? team1Players : team2Players;
                const loserTeam = winner === 1 ? team2Players : team1Players;
                const [winElo, loseElo] = eloChanges[queueType];
                const team1Promise = winnerTeam.map(async (id) => {
                    const userStats = (await Database.getUserStats(id, true))[0];
                    const newElo = Math.max(userStats.elo - winElo, 0);
                    const newWins = Math.max(userStats.wins - 1, 0);
                    const [rankId, rankName] = getRoleId(newElo);
                    const updates = {
                        elo: newElo,
                        wins: newWins,
                        games_played: Math.max(userStats.games_played - 1, 0),
                        wlr: (userStats.losses ? newWins / userStats.losses : newWins).toFixed(2),
                        rank_id: rankId,
                        rank: rankName,
                    };
                    await Database.updateUserStats(userStats, updates);
                    usersMap.set(id, {
                        oldRankId: userStats.rank_id,
                        newRankId: rankId,
                        oldElo: userStats.elo,
                        newElo: newElo,
                    });
                });
                const team2Promise = loserTeam.map(async (id) => {
                    const userStats = (await Database.getUserStats(id, true))[0];
                    const newElo = Math.max(userStats.elo + loseElo, 0);
                    const newLosses = Math.max(userStats.losses - 1, 0);
                    const [rankId, rankName] = getRoleId(newElo);
                    const updates = {
                        elo: newElo,
                        losses: newLosses,
                        games_played: Math.max(userStats.games_played - 1, 0),
                        wlr: (newLosses ? userStats.wins / newLosses : userStats.wins).toFixed(2),
                        rank_id: rankId,
                        rank: rankName,
                    };
                    await Database.updateUserStats(userStats, updates);
                    usersMap.set(id, {
                        oldRankId: userStats.rank_id,
                        newRankId: rankId,
                        oldElo: userStats.elo,
                        newElo: newElo,
                    });
                });
                await Promise.allSettled([...team1Promise, ...team2Promise]);
                const refStats = await Database.getRefStats(staffId);
                if (refStats) {
                    await Database.updateRefStats(staffId, {
                        ...refStats,
                        undos: (refStats.undos ?? 0) + 1,
                        calls: (refStats.calls || 1) - 1,
                    });
                }
                return {
                    type: action,
                    winnerTeam,
                    loserTeam,
                    usersMap,
                };
            }
            else {
                // console.log("No winner");
                const refStats = await Database.getRefStats(staffId);
                if (refStats) {
                    await Database.updateRefStats(staffId, {
                        ...refStats,
                        undos: (refStats.undos ?? 0) + 1,
                    });
                }
                return {
                    type: action,
                    winnerTeam: false,
                };
            }
        }
    }
    static async updateUsername(userId, username) {
        await Database.updateUsername(userId, Utils.sanitiseUsername(username));
    }
    static async updateUserStats(oldStats, newStats) {
        await Database.updateUserStats(oldStats, newStats);
    }
    static async updateGameData(gameNumber, newData) {
        await Database.updateGameData(gameNumber, newData);
    }
    static async subPlayer(oldId, newId, gameNumber, staffId, replaceCaptain) {
        await Database.subPlayer(oldId, newId, gameNumber, replaceCaptain);
    }
    static async banUser(userId, reason, unbanTime, staffId) {
        await Database.banUser(userId, reason, unbanTime, staffId);
    }
    static async unbanUser(userId) {
        await Database.unbanUser(userId);
    }
    static async getAllBans() {
        return Database.getActiveBans();
    }
    static async updateRefStats(userId, newStats) {
        await Database.updateRefStats(userId, newStats);
    }
    static async registerRef(userId) {
        await Database.registerRef(userId);
    }
    static async setCaptains(newCap1, newCap2, gameNumber) {
        const gameData = await Layer2.getRecentGameData(undefined, undefined, gameNumber);
        // console.log(gameData?.captain1, gameData?.captain2)
        if (!gameData)
            throw new Error(Errors.gameNotFound);
        if (gameData.status !== "Picking")
            throw new Error(Errors.invalidGame);
        const [team1Players, team2Players, remaining, allPlayers] = await Utils.cleanGameData(gameData);
        if (!allPlayers.includes(newCap1) || !allPlayers.includes(newCap2))
            throw new Error("The new captains are not part of the game");
        if (newCap1 === newCap2)
            throw new Error("Both teams cannot have the same player");
        // schuffed way to do this sht
        await Database.shuffleGame(newCap1, newCap2, allPlayers.filter((id) => id !== newCap1 && id !== newCap2), gameData.game_number, { no: new Set(), yes: new Set([newCap1]) }, false);
    }
    static async finalRanking(seasonId, type) {
        if (type === "elo")
            return Database.finalEloRanking(seasonId);
        else if (type === "gamesPlayed")
            return Database.finalGamesPlayed(seasonId);
        else if (type === "wins")
            return Database.finalWinsRanking(seasonId);
        else if (type === "losses")
            return Database.finalLossesRanking(seasonId);
        else
            return Database.finalWLRRanking(seasonId);
    }
    static async getGamesReport() {
        return Database.getGameReport();
    }
    static async endSeason(seasonId) {
        await Database.endSeason(seasonId);
        const allusers = await Database.getAllUsers(seasonId);
        return allusers;
    }
    static async startSeason() {
        return Database.startSeason();
    }
    // INSERT SERVER KOTC DETAILS
    // THIS STORES MAP DETAILS
    static async insertKOTC(details, table) {
        const gameNumber = await Database.insertKOTC(details, table);
        return gameNumber;
    }
    // THIS STORES PLAYER STATS
    static async insertKOTCStats(details, table) {
        const gameNumber = await Database.insertKOTCStats(details, table);
        return gameNumber;
    }
    static async getKOTCMap(gameNumber, table) {
        return Database.getKOTCMap(gameNumber, table);
    }
    static async getKOTCStats(gameNumber, table) {
        return Database.getKOTCStats(gameNumber, table);
    }
}
