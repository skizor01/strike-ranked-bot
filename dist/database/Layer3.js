import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, ChannelType, ComponentType, EmbedBuilder, NewsChannel, } from "discord.js";
import { Layer2 } from "./Layer2.js";
import { Errors } from "../types/errors.js";
import { makeEmbed, Utils } from "../utils/others.js";
import colors, { RANK_ROLE_IDS } from "../config/index.js";
import Database from "./index.js";
import { CustomRegex } from "../utils/customRegex.js";
import { stat } from "node:fs";
import pLimit from "p-limit";
import { getRoleId, ranks } from "../utils/getRoleId.js";
import queuesManager from "../queue/queueManager.js";
import gameManager from "../utils/GameManager.js";
let game;
export class Layer3 {
    static async formatUserStats(userId, currentSSn, exclude, season) {
        const res = await Layer2.getUserSeasonStats(userId, currentSSn, season);
        if (!res)
            throw new Error(Errors.noUserStats);
        const formatted = Object.fromEntries(Object.entries(res).filter(([key]) => !exclude.includes(key)));
        return formatted;
    }
    static async getRecentGameData(offset, queueType, gameNumber) {
        const gameData = await Layer2.getRecentGameData(offset, queueType, gameNumber);
        if (!gameData)
            throw new Error(Errors.gameNotFound);
        const { game_number, status, winner, by_user, game_code, queue_type } = gameData;
        const packetHandler = gameManager.getGame(game_code);
        let row = null;
        const [formattedT1, formattedT2, remaining] = await Utils.cleanGameData(gameData, true, status !== "Picking");
        const embed = makeEmbed(`Gameinfo #${game_number}`, "normalColor", false);
        embed.addFields({
            name: "Team #1:",
            value: (status === "Picking" ? `Captain: ` : "") + `${formattedT1.join("\n")}`,
        }, {
            name: "Team #2:",
            value: (status === "Picking" ? `Captain: ` : "") + `${formattedT2.join("\n")}`,
        });
        if (status === "Voided") {
            embed.setColor(colors.voided);
            embed.addFields({ name: "Status", value: `Voided by <@${by_user}>` });
        }
        else if (status === "Not Called") {
            embed.setColor(colors.notScored).addFields({ name: "Status", value: "Not Called" });
            if (packetHandler) {
                row = new ActionRowBuilder();
                if (["2v2", "3v3", "4v4"].includes(queue_type)) {
                    const btn = new ButtonBuilder()
                        .setCustomId("toggle")
                        .setEmoji({ name: "🐧" })
                        .setStyle(ButtonStyle.Secondary);
                    row.addComponents(btn);
                }
                else {
                    const btn = new ButtonBuilder()
                        .setCustomId("toggle")
                        .setEmoji({ name: "📊" })
                        .setStyle(ButtonStyle.Secondary);
                    row.addComponents(btn);
                }
            }
        }
        else if (status === "Picking") {
            embed.setColor(colors.notScored);
            embed.addFields({
                name: "Remaining players:",
                value: remaining.join("\n"),
            });
        }
        else if (status === "Called" && winner) {
            embed.setColor(colors.scored);
            const winningTeam = Number(winner) === 1 ? formattedT1 : formattedT2;
            const losingTeam = Number(winner) === 1 ? formattedT2 : formattedT1;
            embed.setFields({ name: `Winning Team: \`#${winner}\``, value: winningTeam.join("\n") }, { name: `Losing Team: \`#${3 - winner}\``, value: losingTeam.join("\n") });
            embed.addFields({ name: "Status", value: `Scored by <@${by_user}>` });
        }
        return [embed, row];
    }
    static async getLeaderboard(lbMode, stat, page, currentSSn = true) {
        // let data;
        const lbMap = {
            overall: "user_stats",
            weekly: "weekly_stats",
        };
        const data = await Layer2.getLeaderboard(lbMap[lbMode], stat, page, currentSSn);
        const totalPlayers = data[0]?.total_rows ?? 0;
        const totalPages = Math.ceil(totalPlayers / 10);
        const entries = data.map((obj) => ({
            username: obj.username,
            value: obj[stat],
            rank: obj.ranking,
        }));
        // console.log(entries);
        return {
            totalPages,
            entries,
            totalPlayers,
        };
    }
    static async shuffleGame(votes, gameData) {
        const [, , , allPlayers] = await Utils.cleanGameData(gameData);
        const gameNumber = gameData.game_number;
        const result = await Layer2.shuffleGame(allPlayers, gameNumber, votes);
        if (result === false) {
            return makeEmbed("Shuffle Failed", "error", false, "Continue on...");
        }
        else {
            const [cap1, cap2, remainingPlayers] = result;
            return makeEmbed(`Starting Game #${gameNumber}:`, "normalColor", true, `**Format:** \`${gameData.queue_type}\``).addFields({
                name: "Team 1:",
                value: `Captain: <@${cap1}>`,
            }, {
                name: "Team 2:",
                value: `Captain: <@${cap2}>`,
            }, {
                name: "Remaining Players:",
                value: remainingPlayers.map((id) => `<@!${id}>`).join("\n"),
            });
        }
    }
    static async pickPlayers(args, gameData) {
        const ids = CustomRegex.getUserIds(args);
        let [team1Players, team2Players, remainingPlayers] = await Utils.cleanGameData(gameData);
        const { current_picks, current_captains_turn, captain1, captain2, game_number, pick2_players, queue_type, status, } = gameData;
        let message = "";
        if (!team1Players || !team2Players || !remainingPlayers)
            throw new Error("Something went wrong...");
        const playersToPick = ids.slice(0, pick2_players ? 2 : 1);
        let nextCaptain = current_captains_turn;
        let stat = status;
        let currentPicks = current_picks;
        let pick2Players = pick2_players;
        let startVoting = false;
        let allPlayers = [];
        team1Players.shift();
        team2Players.shift();
        // console.log(playersToPick, currentPicks)
        // console.log(typeof gameData.current_picks, typeof gameData.pick2_players)
        for (const id of playersToPick) {
            if (!remainingPlayers.includes(id)) {
                throw new Error(`<@${id}> is not available to be picked`);
            }
            if (current_captains_turn === "Captain 1")
                team1Players.push(id);
            else
                team2Players.push(id);
            remainingPlayers = remainingPlayers.filter((pid) => id !== pid);
            currentPicks += 1;
        }
        if (currentPicks === current_picks)
            throw new Error("No players picked");
        if (pick2_players && currentPicks === 1) {
            pick2Players = false;
            nextCaptain = current_captains_turn;
            message = `<@!${nextCaptain === "Captain 1" ? captain1 : captain2}>, **Select 1 more player**`;
        }
        else {
            pick2Players = true;
            nextCaptain = current_captains_turn === "Captain 1" ? "Captain 2" : "Captain 1";
            message = `<@${nextCaptain === "Captain 1" ? captain1 : captain2}>, **Select 2 players**`;
            currentPicks = 0;
        }
        // console.log(nextCaptain);
        if (remainingPlayers.length === 1 && remainingPlayers[0]) {
            // console.log(nextCaptain, remainingPlayers);
            if (nextCaptain === "Captain 2")
                team2Players.push(remainingPlayers[0]);
            else if (nextCaptain === "Captain 1")
                team1Players.push(remainingPlayers[0]);
            remainingPlayers.length = 0;
            stat = "Not Called";
            message = "";
            startVoting = true;
            allPlayers = [
                ...team1Players,
                ...team2Players,
                ...remainingPlayers,
                captain1,
                captain2,
            ];
        }
        // console.log(stat)
        const embed = makeEmbed(`Game #${game_number}`, "notScored", true, `**Format:** \`${queue_type}\``);
        embed.addFields({
            name: "Team 1:",
            value: `Captain: <@!${captain1}>\n` + team1Players.map((id) => `<@!${id}>`).join("\n"),
        }, {
            name: "Team 2:",
            value: `Captain: <@!${captain2}>\n` + team2Players.map((id) => `<@!${id}>`).join("\n"),
        });
        if (remainingPlayers.length) {
            embed.addFields({
                name: "Remaining Players:",
                value: remainingPlayers.map((id) => `<@!${id}>`).join("\n"),
            });
        }
        await Layer2.pickPlayers(pick2Players, currentPicks, nextCaptain, stat, game_number, team1Players, team2Players);
        return { embed, content: message, startVoting, allPlayers };
    }
    static async scoreGame(gameNumber, winner, gameData, staffId) {
        const [team1Players, team2Players, remainingPlayers, allPlayers] = await Utils.cleanGameData(gameData);
        const obj = await Layer2.processGame("score", team1Players, team2Players, gameNumber, gameData.queue_type, staffId, winner);
        if (obj?.type !== "score" || !allPlayers)
            return;
        const { winnerTeam, loserTeam, usersMap } = obj;
        // console.log(usersMap)
        const embed = makeEmbed(`Game #${gameNumber}`, "scored", true);
        const formattedWinners = [];
        const formattedLosers = [];
        for (const id of winnerTeam) {
            const user = usersMap.get(id);
            formattedWinners.push(`<@${id}> \`[${user.oldElo} ➝ ${user.newElo}]\``);
        }
        for (const id of loserTeam) {
            const user = usersMap.get(id);
            formattedLosers.push(`<@${id}> \`[${user.oldElo} ➝ ${user.newElo}]\``);
        }
        embed.setFields({
            name: `Winning Team \`#${winner}\``,
            value: formattedWinners.join("\n"),
        }, {
            name: `Losing Team \`#${3 - winner}\``,
            value: formattedLosers.join("\n"),
        }, {
            name: "Scored By",
            value: `<@${staffId}>`,
        });
        return { embed, usersMap, allPlayers };
    }
    static async voidGame(gameNumber, gameData, staffId) {
        const [team1Players, team2Players, remainingPlayers, allPlayers] = await Utils.cleanGameData(gameData, true);
        const res = await Layer2.processGame("void", team1Players, team2Players, gameNumber, gameData.queue_type, staffId);
        if (!res)
            return false;
        if (res.type !== "void")
            return false;
        return makeEmbed(`Game #${gameNumber}`, "voided", true).setFields({
            name: "Team #1",
            value: "Captain: " + team1Players?.join("\n"),
        }, {
            name: "Team #22",
            value: "Captain: " + team2Players?.join("\n"),
        }, {
            name: "Voided by",
            value: `<@${staffId}>`,
        });
    }
    static async undoGame(gameData, staffId) {
        const gameNumber = gameData.game_number;
        const [team1Players, team2Players, remaining, allPlayers] = await Utils.cleanGameData(gameData);
        const obj = await Layer2.processGame("undo", team1Players, team2Players, gameNumber, gameData.queue_type, staffId, gameData.winner);
        if (obj?.type !== "undo")
            return;
        if (typeof obj.winnerTeam === "boolean") {
            const [team1Players, team2Players, remaining, allPlayers] = await Utils.cleanGameData(gameData, true);
            const embed = makeEmbed(`Game #${gameNumber}`, "notScored", true);
            embed.setFields({
                name: "Team #1",
                value: "Captain: " + team1Players.join("\n"),
            }, {
                name: "Team #2",
                value: "Captain: " + team2Players.join("\n"),
            });
            if (remaining.length > 0) {
                embed.addFields({
                    name: "Remaining Players",
                    value: remaining.join("\n"),
                });
            }
            embed.addFields({ name: "Undone by", value: `<@${staffId}>` });
            return { embed, oldStatus: "Voided" };
        }
        const { winnerTeam, loserTeam, usersMap } = obj;
        const embed = makeEmbed(`Game #${gameNumber}`, "notScored", true);
        // if (gameData.status === "Voided") {
        // 	console.log("game voided, need to undo")
        // }
        const formattedWinners = [];
        const formattedLosers = [];
        for (const id of winnerTeam) {
            const user = usersMap.get(id);
            formattedWinners.push(`<@${id}> \`[${user.oldElo} ➝ ${user.newElo}]\``);
        }
        for (const id of loserTeam) {
            const user = usersMap.get(id);
            formattedLosers.push(`<@${id}> \`[${user.oldElo} ➝ ${user.newElo}]\``);
        }
        // console.log(formattedWinners, formattedLosers)
        embed.setFields({
            name: `Winning Team \`#${gameData.winner}\``,
            value: formattedWinners.join("\n"),
        }, {
            name: `Losing Team \`#${3 - (gameData.winner || 3)}\``,
            value: formattedLosers.join("\n"),
        }, {
            name: "Undone By",
            value: `<@${staffId}>`,
        });
        return { embed, usersMap, allPlayers, oldStatus: "Scored" };
    }
    static async getPendingGames(howFar) {
        const data = await Layer2.getPendingGames(howFar);
        // console.log(data)
        const embed = makeEmbed("Pending Games", "normalColor", false);
        if (data.length === 0) {
            embed.setDescription("No Pending games, good job 🐧");
        }
        else {
            for (const obj of data) {
                embed.addFields({ name: obj.name.toString(), value: obj.value });
            }
        }
        return embed;
    }
    static async getBanDetails(user) {
        const details = await Layer2.getBanDetails(user.id);
        const embed = makeEmbed(`${user.username} Ban History`, "normalColor", false);
        if (!details)
            throw new Error(Errors.noUserStats);
        if (details.unban_time) {
            const unbanTime = new Date(details.unban_time);
            const unix = Math.floor(unbanTime.getTime() / 1000);
            embed.setDescription(`**Current ban expires** <t:${unix}:R>\n**Total Bans:** ${details.total_bans}`);
            embed.setFields({
                name: "Reason",
                value: details.reason,
            }, {
                name: "By",
                value: `<@${details.by_user}>`,
            });
        }
        else {
            embed.setDescription(`**Not banned currently**\n**Total Bans:** ${details.total_bans ?? 0}`);
        }
        return embed;
    }
    static async getFinalRanking(seasonId) {
        const eloData = await Layer2.finalRanking(seasonId, "elo");
        const gamesPlayedData = await Layer2.finalRanking(seasonId, "gamesPlayed");
        const winsData = await Layer2.finalRanking(seasonId, "wins");
        const lossesData = await Layer2.finalRanking(seasonId, "losses");
        const wlrData = await Layer2.finalRanking(seasonId, "wlr");
        const arr = [
            ["wins", "Wins", winsData],
            ["losses", "Losses", lossesData],
            ["wlr", "WLR", wlrData],
            ["gamesPlayed", "Games Played", gamesPlayedData],
            ["elo", "ELO", eloData],
        ];
        const embeds = [];
        arr.map((value) => {
            const title = `Final ${value[1]} Ranking`;
            let dataValue = "elo";
            if (value[1] === "ELO")
                dataValue = "elo";
            else if (value[1] === "Games Played")
                dataValue = "games_played";
            else if (value[1] === "Losses")
                dataValue = "losses";
            else if (value[1] === "WLR")
                dataValue = "wlr";
            else if (value[1] === "Wins")
                dataValue = "wins";
            const iRanOutOfNames = value[2];
            embeds.push(makeEmbed(title, "normalColor", true).setDescription(iRanOutOfNames
                .map((data, index) => `\`${index + 1}.\` ${Utils.sanitiseUsername(data.username)} → ${data[dataValue]}`)
                .join("\n")));
        });
        return embeds;
    }
    static async handleSeason(interaction, command) {
        const arr = ["yes", "no"];
        const buttons = new ActionRowBuilder().addComponents(...arr.map((entry) => new ButtonBuilder()
            .setCustomId(entry)
            .setLabel(Utils.capitaliseWord(entry))
            .setStyle(entry === "yes" ? ButtonStyle.Success : ButtonStyle.Danger)));
        const currentSeason = await Database.getCurrentSeason();
        const embed = makeEmbed(`${Utils.capitaliseWord(command)} Season #${command === "start" ? currentSeason.season_id + 1 : currentSeason.season_id}`, "normalColor", false);
        const channel = interaction.channel;
        if (channel?.type !== ChannelType.GuildText)
            throw new Error("Where am i?");
        const msg = await interaction.editReply({ embeds: [embed], components: [buttons] });
        const int = await msg.awaitMessageComponent({
            componentType: ComponentType.Button,
            filter: (i) => i.user.id === interaction.user.id,
        });
        const id = int.customId;
        if (id === "no") {
            await interaction.editReply({
                content: `Season ${command} process cancelled`,
                embeds: [],
                components: [],
            });
        }
        else {
            if (command === "end") {
                const pendingGames = await Layer2.getPendingGames(10000);
                if (pendingGames.length > 0)
                    throw new Error("There are some pending games");
                const userStats = await Layer2.endSeason(currentSeason.season_id);
                const limit = pLimit(4);
                const allMembers = await interaction.guild.members.fetch();
                const userSet = new Set(userStats.map((user) => user.user_id));
                const filteredMembers = allMembers.filter((member) => userSet.has(member.id));
                const [rankId, rankName] = getRoleId(0);
                queuesManager.disableAllQueues();
                await interaction.editReply({
                    content: "Updating members and their roles...",
                    embeds: [],
                    components: [],
                });
                const promises = filteredMembers.map((member) => limit(async () => {
                    try {
                        const nick = formatNickname(0, member.user.username);
                        const memberRoles = new Set(member.roles.cache.values().map((role) => role.id));
                        const RANK_ROLE_ID_SET = new Set(Object.values(RANK_ROLE_IDS));
                        const currentRankRole = memberRoles
                            .values()
                            .find((value) => RANK_ROLE_ID_SET.has(value));
                        // console.log(currentRankRole)
                        if (currentRankRole && currentRankRole !== rankId) {
                            // console.log(`Role to remove`)
                            await member.roles.remove(currentRankRole).catch(() => { });
                            await member.roles.add(rankId).catch(() => { });
                        }
                        await member.setNickname(nick).catch(() => { });
                    }
                    catch (e) {
                        console.log(e);
                    }
                }));
                await Promise.allSettled(promises);
                const rankingEmbeds = await this.getFinalRanking(currentSeason.season_id);
                const report = await this.getGamesReport();
                const finalEmbed = makeEmbed(`Shell Drill Season #${currentSeason.season_id} Ended!`, "normalColor", true, report);
                const sendNextEmbed = async () => {
                    for (const embed of rankingEmbeds) {
                        await channel.send({ embeds: [embed] });
                        await Utils.delay(3000);
                    }
                };
                await sendNextEmbed();
                await interaction.followUp({ embeds: [finalEmbed] });
            }
            else if (command === "start") {
                if (currentSeason.current_ssn)
                    throw new Error("Please end the current season first");
                const newSeason = await Layer2.startSeason();
                const embed = makeEmbed(`Season #${newSeason} Started!`, "normalColor", false);
                await interaction.editReply({ embeds: [embed], components: [] });
                queuesManager.enableAllQueues();
            }
        }
    }
    static async getGamesReport() {
        const data = await Layer2.getGamesReport();
        let totalGames = 0;
        let called = 0;
        let notCalled = 0;
        let voided = 0;
        let movedQueues = 0;
        let playersDodged = 0;
        let other = 0;
        for (const obj of data) {
            if (obj.type === "status") {
                totalGames += obj.count;
                if (obj.key === "Called")
                    called = obj.count;
                else if (obj.key === "Not Called")
                    notCalled = obj.count;
                else if (obj.key === "Voided")
                    voided = obj.count;
            }
            else {
                if (obj.key === "Moved Queues")
                    movedQueues = obj.count;
                else if (obj.key === "Player(s) Dodged")
                    playersDodged = obj.count;
                else
                    other = obj.count;
            }
        }
        const s1 = `**Total Games Played:** ${totalGames}`;
        const s2 = `**Total Games Called:** ${called}`;
        const s3 = `**Total Not-Called Games:** ${notCalled}`;
        const s4 = `**Total Cancelled Played:** ${voided}`;
        const lineBreaker = "\n## Break-down of voided games";
        const s5 = `**Moved Queues:** ${movedQueues}`;
        const s6 = `**Players Dodged:** ${playersDodged}`;
        const s7 = `**Other:** ${other}`;
        return `${s1}\n${s2}\n${s3}\n${s4}\n${lineBreaker}\n${s5}\n${s6}\n${s7}`;
    }
    static async gameStartedEmbed(server, map, gameNumber) {
        const gameData = await Layer2.getRecentGameData(undefined, undefined, gameNumber);
        const [team1, team2, remaining, allPlayers] = await Utils.cleanGameData(gameData, true);
        const embed = makeEmbed(`Game #${gameNumber} Started`, "normalColor", true);
        embed
            .setDescription(`**Format:** \`${gameData.queue_type}\``)
            .setFields({
            name: "Team #1:",
            value: team1.join("\n"),
        }, {
            name: "Team #2:",
            value: team2.join("\n"),
        }, {
            name: "Match Details",
            value: `Match will be on ${map.name}, ${server}`,
        })
            .setImage(`https://shellshock.io/maps/${map.filename}.png`)
            .setFooter({ text: "Check DMs for the game code" })
            .setTimestamp();
        return embed;
    }
    static async getRecentUserGames(userid, page, howFar) {
        const games = await Layer2.getRecentUserGames(userid, page, howFar);
        const embed = makeEmbed(false, "normalColor", false, `Games played by <@${userid}>`);
        if (games.length === 0) {
            embed.setDescription(`No saved games played by user <@${userid}>`);
        }
        else {
            for (const game of games) {
                embed.addFields({
                    name: `Game info: ${game.game_number} (${game.queue_type})`,
                    value: `Status: ${game.status}`,
                });
            }
        }
        return [embed, games[0]?.total_rows ?? 0];
    }
}