import { EmbedBuilder } from "@discordjs/builders";
import queuesManager from "../queue/queueManager.js";
import channelRegistry from "./Registry.js";
import colors, { SPECIAL_ROLES, specialChannels } from "../config/index.js";
import { makeEmbed, Utils } from "./others.js";
import { Layer2 } from "../database/Layer2.js";
import { Servers } from "../types/smallTypes.js";
import banManager from "./BanManager.js";
import { Layer3 } from "../database/Layer3.js";
import { makeAccount } from "./login.js";
import MatchMaker from "./matchmaker/matchmaker.js";
import { GameMode } from "./game/index.js";
import { utimes } from "node:fs/promises";
class EventEmitter {
    eventListeners = {};
    on(eventName, listener) {
        const listeners = this.eventListeners[eventName] ?? new Set();
        listeners.add(listener);
        this.eventListeners[eventName] = listeners;
    }
    emit(eventName, ...args) {
        const listeners = this.eventListeners[eventName] ?? new Set();
        for (const listener of listeners) {
            listener(...args);
        }
    }
    off(event, listener) {
        this.eventListeners[event]?.delete(listener);
    }
    once(event) {
        return new Promise((resolve) => {
            const listener = (...args) => {
                this.off(event, listener);
                resolve(args);
            };
            this.on(event, listener);
        });
    }
}
const eventEmitter = new EventEmitter();
export default eventEmitter;
eventEmitter.on("playerLeave", async (channelId, playerId, reason, gameNumber) => {
    const channel = channelRegistry.getChannel(channelId);
    const queue = queuesManager.getQueue(channelId);
    if (!channel || !queue)
        return;
    const embed = new EmbedBuilder().setTitle("Queue Update").setColor(colors.error).setTimestamp();
    let pingMember = false;
    if (reason === "afk") {
        pingMember = true;
        embed.setDescription(`<@${playerId}> has been removed from queue due to inactivity \`[${queue.getPlayers().length}/${queue.getQueueSize()}]\``);
    }
    else if (reason === "sub") {
        embed.setDescription(`<@${playerId}> has been removed from the queue as they were substituted in Game #${gameNumber}`);
    }
    else if (reason === "queueBanned") {
        embed.setDescription(`<@${playerId}> has been removed from the queue as they were Queue Banned`);
    }
    else if (reason === "multiQueue") {
        // game Number is the new queue channel ID in this case
        embed.setDescription(`<@${playerId}> has been removed from the queue as they joined <#${gameNumber}>`);
    }
    await channel.send({ content: pingMember ? `<@${playerId}>` : "", embeds: [embed] });
});
eventEmitter.on("queueFull", async (queue) => {
    const channel = channelRegistry.getChannel(queue.getChannelId());
    const players = queue.getPlayers();
    const Queuetype = queue.getQueueType();
    await queue.clearQueue();
    if (!channel)
        return;
    const fullQueueEmbed = makeEmbed("Queue is full, picking captains.", "normalColor", false);
    await channel.send({ embeds: [fullQueueEmbed] });
    try {
        const shuffledPlayers = Utils.shuffleArray(players);
        let captains = [];
        // console.log(shuffledPlayers);
        // console.log(players);
        //TODO ADD CAPTAIN BL HERE
        captains = shuffledPlayers.slice(0, 2);
        //
        const captain1 = captains[0];
        const captain2 = captains[1];
        const remainingPlayers = players.filter((p) => !captains.includes(p));
        const gameNumber = await Layer2.insertGame(remainingPlayers, Queuetype, captain1, captain2);
        const playerMentions = players.map((id) => `<@${id}>`).join(", ");
        const embed = makeEmbed(`Starting Game #${gameNumber}:`, "normalColor", false)
            .setDescription(`**Format:** \`${Queuetype}\``)
            .addFields({
            name: "Team #1:",
            value: `Captain: <@${captain1}>`,
        }, {
            name: "Team #2:",
            value: `Captain: <@${captain2}>`,
        }, {
            name: "Remaining Players:",
            value: remainingPlayers.map((id) => `<@${id}>`).join("\n"),
        });
        await channel.send({ content: playerMentions, embeds: [embed] });
        const logChannel = await Utils.getChannel(specialChannels.matchLog);
        if (logChannel) {
            await logChannel.send({ embeds: [embed] });
        }
    }
    catch (e) {
        console.trace(e);
    }
});
eventEmitter.on("makeGame", async (server, map, gameNumber, channel, gameMode, maxPlayers, replyOptions) => {
    // console.log(server, map, players)
    const account = await makeAccount();
    const gameData = await Layer2.getRecentGameData(undefined, undefined, gameNumber);
    const [team1, , , allPlayers] = await Utils.cleanGameData(gameData);
    const mm = new MatchMaker({
        channel: channel,
        firebaseId: account.firebaseId,
        gameNumber,
        sessionId: account.sessionId,
        session: account.session,
    });
    const mmPromise = mm.init();
    // console.log("calling join map");
    // await mm.joinMap("https://shellshock.io/#gram-flux-plow");
    if (replyOptions) {
        channel.send(replyOptions);
    }
    await mmPromise;
    mm.createMap(map, server, gameMode, gameMode === 3 ? "KOTC" : "SCRIM", maxPlayers);
    const code = await mm.waitForCode();
    Layer2.updateGameData(gameNumber, { game_code: code });
    const dmEmbed = new EmbedBuilder()
        .setTitle("Join your match!")
        .setDescription("Click on the link below to be directed to your match. It would be greatly appreciated if you joined with your Discord username!")
        .setColor(colors.normalColor)
        .addFields({ name: "", value: `${code || "Bot not working"}`, inline: false });
    const req = allPlayers.map(async (id) => {
        try {
            const member = await Utils.getMember(channel.guild, id);
            if (member)
                await member.send({ embeds: [dmEmbed] });
        }
        catch (e) {
            const embed = new EmbedBuilder()
                .setTitle("DM Error")
                .setDescription(`Could not DM <@${id}>`)
                .setColor(colors.voided);
            await channel.send({ embeds: [embed] });
        }
    });
    await Promise.allSettled(req);
    await Layer2.updateGameData(gameNumber, { game_code: code });
    const linkChannel = await Utils.getChannel(specialChannels.linkLog);
    if (linkChannel) {
        const embed = makeEmbed(`Game #${gameNumber} Created`, "normalColor", true, code);
        await linkChannel.send({ embeds: [embed] });
    }
    if (gameMode === 3) {
        await Layer2.insertKOTC({
            game_number: gameNumber,
            map: map.name,
            region: Utils.getFormattedRegion(server),
        }, "server_kotc");
    }
});
eventEmitter.on("unbanUser", async (userId, reason, staffId) => {
    const banChannel = banManager.getBanChannel();
    const guild = banManager.getGuild();
    const refStats = await Layer2.getRefStats(staffId);
    if (!refStats)
        await Layer2.registerRef(staffId);
    let updatedRefStats = {};
    // console.log(userId, reason)
    const embed = makeEmbed("User Unbanned", "scored", true);
    if (reason === "auto") {
        embed.setFields({
            name: "Reason",
            value: "Auto",
        }, {
            name: "Victim",
            value: `<@${userId}>`,
        });
        updatedRefStats.bans = (refStats?.bans ?? 0) + 1;
    }
    else {
        embed.setFields({
            name: "Reason",
            value: `Unbanned by Staff <@${staffId}>`,
        }, {
            name: "Victim",
            value: `<@${userId}>`,
        }, {
            name: "Reason",
            value: reason,
        });
    }
    await Layer2.updateRefStats(staffId, { ...refStats, ...updatedRefStats });
    await Layer2.unbanUser(userId);
    const member = await Utils.getMember(Utils.guild, userId);
    if (member)
        await member.roles.remove(SPECIAL_ROLES.queueBanned);
    await banChannel.send({ embeds: [embed] });
});
