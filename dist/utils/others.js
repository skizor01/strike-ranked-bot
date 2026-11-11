import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, EmbedBuilder, Guild, GuildMember, TextChannel, } from "discord.js";
import colors from "../config/index.js";
export function makeEmbed(title, color, showTime, description) {
    const embed = new EmbedBuilder().setColor(colors[color]);
    if (showTime)
        embed.setTimestamp();
    if (description)
        embed.setDescription(description);
    if (typeof title === "string")
        embed.setTitle(title);
    return embed;
}
export class Utils {
    static guild;
    static shuffleArray(arr) {
        let shuffledPlayers = [...arr];
        do {
            shuffledPlayers = [...arr];
            for (let i = shuffledPlayers.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffledPlayers[i], shuffledPlayers[j]] = [
                    shuffledPlayers[j],
                    shuffledPlayers[i],
                ];
            }
        } while (shuffledPlayers.every((v, i) => v === arr[i]));
        return shuffledPlayers;
    }
    static async formatPlayer(player) {
        const member = await this.getMember(this.guild, player);
        return member
            ? `<@${player}> ${this.sanitiseUsername(member.user.username)}`
            : `<@${player}> Unknown member`;
    }
    static sanitiseUsername(name) {
        return name.replace(/(?<!\\)([_*~`>|])/g, "\\$1");
    }
    static returnRandomValue(args) {
        const i = Math.floor(Math.random() * args.length);
        return args[i];
    }
    /**
     *
     * @param gameData
     * @returns [team1Players, team2Players, remainingPlayers, allPlayers]
     */
    static async cleanGameData(gameData, discordUI = false, addUsername = false) {
        const { captain1, captain2, players } = gameData;
        const team1 = [];
        const team2 = [];
        const remaining = [];
        const nonCaptains = players.filter((p) => p.user_id !== captain1 && p.user_id !== captain2);
        nonCaptains.sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
        const sortedPlayers = [
            { user_id: captain1, team: "team1", order: 0 },
            { user_id: captain2, team: "team2", order: 0 },
            ...nonCaptains,
        ];
        for (const player of sortedPlayers) {
            const value = addUsername
                ? await this.formatPlayer(player.user_id)
                : discordUI
                    ? `<@${player.user_id}>`
                    : player.user_id;
            if (player.user_id === captain1) {
                team1.unshift(value);
            }
            else if (player.user_id === captain2) {
                team2.unshift(value);
            }
            else if (player.team === "team1") {
                team1.push(value);
            }
            else if (player.team === "team2") {
                team2.push(value);
            }
            else {
                remaining.push(value);
            }
        }
        const team1Players = [
            ...new Set([
                addUsername
                    ? await this.formatPlayer(captain1)
                    : discordUI
                        ? `<@${captain1}>`
                        : captain1,
                ...team1,
            ]),
        ];
        const team2Players = [
            ...new Set([
                addUsername
                    ? await this.formatPlayer(captain2)
                    : discordUI
                        ? `<@${captain2}>`
                        : captain2,
                ...team2,
            ]),
        ];
        const remainingPlayers = [...new Set([...remaining])];
        const allPlayers = [...new Set([...team1Players, ...team2Players, ...remainingPlayers])];
        return [team1Players, team2Players, remainingPlayers, allPlayers];
    }
    static async getMember(guild, id) {
        try {
            const member = guild.members.cache.get(id) ?? (await guild.members.fetch(id));
            return member;
        }
        catch (e) {
            return undefined;
        }
    }
    static async getChannel(id) {
    try {
        if (!Utils.guild) {
            console.error("[getChannel] Utils.guild is not initialized");
            return null;
        }

        const channel = await Utils.guild.channels.fetch(id);

        if (!channel) {
            console.error(`[getChannel] Channel ${id} not found`);
            return null;
        }

        return channel;
    } catch (error) {
        console.error("[getChannel] Failed to fetch channel:", error);
        return null;
    }
}
    static async addRole(member, roleId) {
        try {
            await member.roles.add(roleId);
            return true;
        }
        catch (e) {
            return false;
        }
    }
    static async removeRole(member, roleId) {
        try {
            await member.roles.remove(roleId);
            return true;
        }
        catch (e) {
            return false;
        }
    }
    static capitaliseWord(str) {
        const arr = str.split(" ");
        let newWord = "";
        for (const word of arr) {
            newWord += word.charAt(0).toLocaleUpperCase() + word.slice(1) + " ";
        }
        // return str.charAt(0).toLocaleUpperCase() + str.slice(1);
        return newWord.trim();
    }
    static async delay(ms) {
        return new Promise((res) => setTimeout(res, ms));
    }
    static formatTime(totalSeconds, options = {}) {
        const { separator = ":", showUnits = true } = options;
        const minutes = Math.floor(totalSeconds / 60_000);
        const seconds = Math.floor((totalSeconds % 60_000) / 1000);
        if (showUnits) {
            return `${minutes}m${separator}${String(seconds).padStart(2, "0")}s`;
        }
        return `${minutes}${separator}${String(seconds).padStart(2, "0")}`;
    }
   static capitaliseWord(str) {
    if (!str) return "";

    if (str.startsWith("us") && str.length > 2) {
        return `US ${str.slice(2, 3).toUpperCase()}${str.slice(3)}`;
    }

    return str
        .split(" ")
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
}

static getFormattedRegion(region) {
    return Utils.capitaliseWord(region);
}
    static getNavigationButtons({ currentPage, totalData, perPage, extended = false, }) {
        const totalPages = Math.ceil(totalData / perPage);
        const buttons = [];
        if (extended) {
            buttons.push(new ButtonBuilder()
                .setCustomId("first")
                .setLabel("⏮️")
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(currentPage === 1));
        }
        buttons.push(new ButtonBuilder()
            .setCustomId("prev")
            .setLabel("⬅️")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentPage === 1), new ButtonBuilder()
            .setCustomId("next")
            .setLabel("➡️")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentPage >= totalPages));
        if (extended) {
            buttons.push(new ButtonBuilder()
                .setCustomId("last")
                .setLabel("⏭️")
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(currentPage >= totalPages));
        }
        return new ActionRowBuilder().addComponents(buttons);
    }
    static async paginate({ currentPage, perPage, totalData, fields, embedData, extended, channel, }) {
        const totalItems = totalData.length;
        const totalPages = Math.ceil(totalItems / perPage);
        const getPageData = (page) => {
            const startIndex = (page - 1) * perPage;
            const endIndex = Math.min(startIndex + perPage, totalItems);
            return {
                startIndex,
                endIndex,
                pageFields: fields.slice(startIndex, endIndex),
            };
        };
        const buildMessage = (page) => {
            const { startIndex, endIndex, pageFields } = getPageData(page);
            const embed = this.makeEmbed({
                embedData,
                fields: pageFields,
                startIndex,
                endIndex,
                totalData: totalItems,
            });
            const buttons = Utils.getNavigationButtons({
                currentPage: page,
                perPage,
                totalData: totalItems,
                extended,
            });
            return { embed, buttons };
        };
        const { embed, buttons } = buildMessage(currentPage);
        const msg = await channel.send({
            embeds: [embed],
            components: [buttons],
        });
        const collector = msg.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 60_000,
        });
        collector.on("collect", async (interaction) => {
            await interaction.deferUpdate();
            switch (interaction.customId) {
                case "first":
                    currentPage = 1;
                    break;
                case "prev":
                    currentPage = Math.max(1, currentPage - 1);
                    break;
                case "next":
                    currentPage = Math.min(totalPages, currentPage + 1);
                    break;
                case "last":
                    currentPage = totalPages;
                    break;
            }
            const { embed, buttons } = buildMessage(currentPage);
            await msg.edit({
                embeds: [embed],
                components: [buttons],
            });
        });
        collector.on("end", async () => {
            await msg.edit({ components: [] }).catch(() => null);
        });
    }
    static makeEmbed({ embedData, fields, startIndex, endIndex, totalData, }) {
        return makeEmbed(embedData.title ?? false, "normalColor", false)
            .setFields(fields)
            .setFooter({
            text: `[${startIndex + 1} - ${endIndex}] out of ${totalData}`,
        });
    }
}