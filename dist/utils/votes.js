import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, EmbedBuilder, Message, MessageFlags, PermissionFlagsBits, } from "discord.js";
import { Servers } from "../types/smallTypes.js";
import { makeEmbed, Utils } from "./others.js";
import queuesManager from "../queue/queueManager.js";
import { Mutex } from "async-mutex";
import registry from "./Registry.js";
const sessionTracker = new Map();
class ServerVote {
    mutex = new Mutex();
    votesCounter;
    votedUSers;
    userVotes;
    constructor() {
        this.votesCounter = {};
        this.votedUSers = new Set();
        this.userVotes = new Map();
        Object.keys(Servers).forEach((server) => {
            this.votesCounter[server] = 0;
            this.userVotes.set(server, []);
        });
    }
    addVote(userId, server) {
        this.votesCounter[server]++;
        this.votedUSers.add(userId);
        this.userVotes.get(server)?.push(`<@!${userId}>`);
        // console.log(this);
    }
    getWinner() {
        const maxVotes = Math.max(...Object.values(this.votesCounter));
        const winners = Object.keys(this.votesCounter).filter((server) => this.votesCounter[server] === maxVotes);
        if (winners.includes("Germany")) {
            return "Germany";
        }
        else if (winners.length > 1) {
            return Utils.returnRandomValue(winners) ?? "Germany";
        }
        else {
            return winners[0] ?? "Germany";
        }
    }
    getServerVotes(server) {
        return this.votesCounter[server];
    }
    hasUserVoted(userId) {
        return this.votedUSers.has(userId);
    }
    formatVotes() {
        const fields = [];
        this.userVotes.forEach((votes, server) => {
            // console.log(server, votes)
            fields.push({
                name: server,
                value: votes.length > 0 ? votes.join("\n") : "None",
                inline: true,
            });
        });
        return fields;
    }
}
export async function startServerVote(channel, players, gameNumber) {
    return new Promise(async (resolve, reject) => {
        // console.log(maps);
        const channelId = channel.id;
        const voteKey = `server-${channelId}-${gameNumber}`;
        try {
            if (!sessionTracker.has(voteKey)) {
                sessionTracker.set(voteKey, new ServerVote());
            }
            const serverVote = sessionTracker.get(voteKey) ?? new ServerVote();
            if (!(serverVote instanceof ServerVote))
                return;
            let reactionTime = 15_000;
            const endTime = Math.floor((Date.now() + reactionTime) / 1000);
            const embed = makeEmbed(`Server Vote Game #${gameNumber}`, "normalColor", false);
            Object.keys(Servers).forEach((server) => {
                embed.addFields({
                    name: server,
                    value: "None",
                    inline: true,
                });
            });
            embed.addFields({ name: "Expires in", value: `<t:${endTime}:R>` });
            const buttonRow = new ActionRowBuilder().addComponents(Object.keys(Servers).map((server) => new ButtonBuilder()
                .setCustomId(`${server}`)
                .setLabel(server)
                .setStyle(ButtonStyle.Secondary)));
            const playerMentions = players.map((id) => `<@!${id}>`).join(", ");
            const msg = await channel.send({
                content: playerMentions,
                embeds: [embed],
                components: [buttonRow],
            });
            const collector = msg.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: reactionTime,
                filter: (int) => players.includes(int.user.id),
            });
            collector.on("collect", async (interaction) => {
                if (!interaction.deferred)
                    await interaction.deferUpdate();
                let snapshot = {};
                await serverVote.mutex.runExclusive(async () => {
                    const userId = interaction.user.id;
                    const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
                    const votedServer = interaction.customId;
                    const embed = msg.embeds[0];
                    if (serverVote.hasUserVoted(userId) && !isAdmin) {
                        snapshot = {
                            embed: null,
                            stop: false,
                        };
                        return;
                    }
                    serverVote.addVote(userId, votedServer);
                    const formattedVotes = serverVote.formatVotes();
                    const newEmbed = EmbedBuilder.from(embed)
                        .setFields(formattedVotes)
                        .addFields({
                        name: "Expires",
                        value: `<t:${endTime}:R>`,
                    });
                    const votes = serverVote.getServerVotes(votedServer);
                    snapshot = {
                        embed: newEmbed,
                        stop: (votedServer === "Germany" && votes >= players.length / 2) ||
                            votes > players.length / 2,
                    };
                });
                if (snapshot?.embed) {
                    await msg.edit({ embeds: [snapshot.embed] });
                }
                if (snapshot?.stop) {
                    collector.stop();
                }
            });
            collector.on("end", async () => {
                const winner = serverVote.getWinner();
                await serverVote.mutex.waitForUnlock();
                const embed = EmbedBuilder.from(msg.embeds[0])
                    .setDescription(`**Winner: ${winner}**`)
                    .spliceFields(-1, 1);
                await msg.edit({ embeds: [embed], components: [] });
                sessionTracker.delete(voteKey);
                resolve([winner, Servers[winner]]);
            });
        }
        catch (e) {
            console.trace(e);
        }
    });
}
class MapVote {
    mutex = new Mutex();
    static lastMap;
    votesCounter;
    votedUsers;
    userVotes;
    shuffleVotes;
    hasShuffled;
    constructor() {
        this.votesCounter = {};
        this.votedUsers = new Set();
        this.userVotes = new Map();
        this.shuffleVotes = [];
        this.hasShuffled = false;
    }
    init() {
        let pool = registry.getCurrentMapPool();
        if (MapVote.lastMap) {
            pool = pool.filter((m) => m.name !== MapVote.lastMap);
        }
        const maps = Utils.shuffleArray(pool).slice(0, 3);
        this.resetVotes();
        for (const map of maps) {
            this.votesCounter[map.name] = 0;
            this.userVotes.set(map.name, []);
        }
        return maps;
    }
    addVote(userId, map) {
        if (map === "Shuffle") {
            this.shuffleVotes.push(`<@${userId}>`);
            return;
        }
        if (typeof this.votesCounter[map] === "number")
            this.votesCounter[map]++;
        this.votedUsers.add(userId);
        this.userVotes.get(map)?.push(`<@${userId}>`);
    }
    getWinner() {
        const maxVotes = Math.max(...Object.values(this.votesCounter));
        const winners = Object.keys(this.votesCounter).filter((mapName) => this.votesCounter[mapName] === maxVotes);
        const shuffleVotes = this.shuffleVotes.length;
        // console.log(shuffleVotes, this.hasShuffled, winners)
        if (shuffleVotes >= maxVotes && !this.hasShuffled)
            return "Shuffled";
        if (winners.length > 1) {
            const random = Utils.returnRandomValue(winners);
            return random;
        }
        else {
            return winners[0];
        }
    }
    checkShuffle() {
        return this.hasShuffled;
    }
    formatVotes() {
        const fields = [];
        this.userVotes.forEach((votes, map) => {
            fields.push({
                name: map,
                value: votes.length > 0 ? votes.join("\n") : "None",
                inline: true,
            });
        });
        if (!this.hasShuffled) {
            fields.push({
                name: "Shuffle",
                value: this.shuffleVotes.length > 0 ? [...this.shuffleVotes].join("\n") : "None",
                inline: false,
            });
        }
        return fields;
    }
    hasUserVoted(userId) {
        const shuffle = this.shuffleVotes.includes(`<@${userId}>`);
        return [this.votedUsers.has(userId), shuffle];
    }
    setShuffled() {
        this.hasShuffled = true;
        this.resetVotes();
    }
    resetVotes() {
        this.votesCounter = {};
        this.shuffleVotes.length = 0;
        this.votedUsers.clear();
        this.userVotes.clear();
    }
    getUserVotes() {
        return this.userVotes;
    }
    getOptionVotes(option) {
        if (option === "Shuffle")
            return this.shuffleVotes;
        return this.userVotes.get(option);
    }
}
export async function startMapVote(channel, players, gameNumber) {
    return new Promise(async (resolve, reject) => {
        const channelId = channel.id;
        const queue = queuesManager.getQueue(channelId);
        const voteKey = `map-${channelId}-${gameNumber}`;
        if (queue.getQueueMode() === "SCRIM") {
            const scrimMap = registry.getScrimMap();
            if (scrimMap)
                resolve(scrimMap);
            return;
        }
        try {
            // const selectedMaps = Utils.shuffleArray<TMap>(registry.getCurrentMapPool()).slice(0, 3);
            const reactionTime = 15_000;
            const endTime = Math.floor((Date.now() + reactionTime) / 1000);
            if (!sessionTracker.has(voteKey)) {
                sessionTracker.set(voteKey, { mapVote: new MapVote() });
            }
            const mapObj = sessionTracker.get(voteKey);
            if (mapObj instanceof ServerVote)
                return;
            const mapVote = mapObj?.mapVote;
            const selectedMaps = mapVote.init();
            const isShuffled = mapVote.checkShuffle();
            const embed = makeEmbed(`Map Vote Game #${gameNumber}`, "normalColor", false);
            embed.setFields(mapVote.formatVotes());
            const buttonRow = new ActionRowBuilder().addComponents([...mapVote.getUserVotes().keys()].map((map) => new ButtonBuilder()
                .setCustomId(map)
                .setLabel(map)
                .setStyle(ButtonStyle.Secondary)));
            // console.log(mapVote.getUserVotes().)
            if (!isShuffled) {
                buttonRow.addComponents(new ButtonBuilder()
                    .setCustomId("Shuffle")
                    .setLabel("Shuffle")
                    .setStyle(ButtonStyle.Secondary));
            }
            else {
                embed.setTitle(`Map Vote Game #${gameNumber} (Shuffled)`);
            }
            embed.addFields({
                name: "Expires",
                value: `<t:${endTime}:R>`,
            });
            const playerMentions = players.map((id) => `<@!${id}>`).join(", ");
            const msg = mapObj.oldMessage
                ? await mapObj.oldMessage.edit({
                    embeds: [embed],
                    components: [buttonRow],
                })
                : await channel.send({
                    content: playerMentions,
                    embeds: [embed],
                    components: [buttonRow],
                });
            const collector = msg.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: reactionTime,
                filter: (int) => players.includes(int.user.id),
            });
            collector.on("collect", async (interaction) => {
                await interaction.deferUpdate();
                let snapshot = {};
                let alreadyVoted = false;
                await mapVote.mutex.runExclusive(async () => {
                    const userId = interaction.user.id;
                    // @ts-ignore
                    const isAdmin = interaction.member?.permissions.has(PermissionFlagsBits.Administrator);
                    const votedMap = interaction.customId;
                    const [hasVoted, hasShuffled] = mapVote.hasUserVoted(userId);
                    if (hasShuffled && votedMap === "Shuffle") {
                        alreadyVoted = true;
                        return;
                    }
                    if (hasVoted && !isAdmin && votedMap !== "Shuffle") {
                        alreadyVoted = true;
                        return;
                    }
                    mapVote.addVote(userId, votedMap);
                    const fields = mapVote.formatVotes();
                    const newEmbed = EmbedBuilder.from(msg.embeds[0])
                        .setFields(fields)
                        .addFields({
                        name: "Expires",
                        value: `<t:${endTime}:R>`,
                    });
                    const votes = mapVote.getOptionVotes(votedMap);
                    if (!votes)
                        return;
                    snapshot = {
                        embed: newEmbed,
                        stop: (votedMap === "Shuffle" && votes.length >= players.length / 2) ||
                            votes.length > players.length / 2,
                    };
                });
                if (alreadyVoted) {
                    await interaction.followUp({
                        content: "You have already voted",
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }
                if (snapshot?.embed) {
                    await msg.edit({ embeds: [snapshot.embed] });
                }
                if (snapshot?.stop) {
                    collector.stop();
                }
            });
            collector.on("end", async () => {
                const winner = mapVote.getWinner();
                await mapVote.mutex.waitForUnlock();
                if (winner === "Shuffled") {
                    mapVote.setShuffled();
                    sessionTracker.set(voteKey, { mapVote: mapVote, oldMessage: msg });
                    return resolve(startMapVote(channel, players, gameNumber));
                }
                const newEmbed = EmbedBuilder.from(msg.embeds[0])
                    .setDescription(`**Winner: ${winner}**`)
                    .spliceFields(0, 6, ...mapVote.formatVotes());
                const map = selectedMaps.find((mapbj) => mapbj.name === winner);
                await msg.edit({ embeds: [newEmbed], components: [] });
                sessionTracker.delete(voteKey);
                MapVote.lastMap = winner;
                resolve(map);
            });
        }
        catch (e) {
            console.trace(e);
        }
    });
}
