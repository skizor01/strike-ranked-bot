import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { CustomClient } from "./CustomClient.js";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, ComponentType, EmbedBuilder, GatewayIntentBits, InteractionContextType, InteractionType, LabelBuilder, MessageFlags, ModalBuilder, Partials, PermissionFlagsBits, REST, Routes, StringSelectMenuBuilder, StringSelectMenuComponent, TextInputBuilder, TextInputStyle, UnfurledMediaItem, } from "discord.js";
import { loadCommands } from "./utils/loadCommands.js";
import "dotenv/config";
import queuesManager from "./queue/queueManager.js";
import { canUseCommand } from "./utils/roleChecker.js";
import colors, { specialChannels } from "./config/index.js";
import registry from "./utils/Registry.js";
import { Utils } from "./utils/others.js";
import banManager from "./utils/BanManager.js";
import { Layer2 } from "./database/Layer2.js";
import gameManager from "./utils/GameManager.js";
import { CustomRegex } from "./utils/customRegex.js";
import { measureMemory } from "node:vm";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const client = new CustomClient({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates,
    ],
    partials: [Partials.Message, Partials.GuildMember],
});
const slashData = [];
const userSlashData = [];
const commandsPath = path.join(__dirname, "commands");
const userCommandsPath = path.join(__dirname, "commands-global");
// console.log(process.env.TOKEN)
// loadCommands(client, commandsPath, slashData);

import { pool } from "./database/index.js";

try {
    await pool.query("SELECT NOW()");
    console.log("DATABASE CONNECTED");
} catch (err) {
    console.error("DATABASE FAILED", err);
}

const rest = new REST().setToken(process.env.TOKEN);
(async () => {
    try {
        await loadCommands(client, commandsPath, slashData);
        const data = (await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), 
        // Routes.applicationCommands(process.env.CLIENT_ID),
        { body: slashData }));
        console.log(`Successfully reloaded ${data.length} guild-application (/) commands.`);
    }
    catch (e) { }
})();
(async () => {
    try {
        await loadCommands(client, userCommandsPath, userSlashData);
        const data = (await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: userSlashData }));
        console.log(`Successfully reloaded ${data.length} user-application (/) commands.`);
    }
    catch (e) { }
})();

client.once("ready", async (client) => {
    console.log(`READY: ${client.user.tag}`);

    try {
        const guildId = process.env.GUILD_ID;

        if (!guildId) {
            console.error("[Utils] GUILD_ID is missing from .env");
            return;
        }

        const guild = await client.guilds.fetch(guildId);
        Utils.guild = guild;

        console.log("[Utils] Guild initialized:", guild.name);

        const channel = await Utils.getChannel(specialChannels.gameIdsLog);

        if (channel) {
            console.log("[Game ID Logger] Logging channel initialized:", channel.name);
        } else {
            console.error(
                "[Game ID Logger] Could not access channel:",
                specialChannels.gameIdsLog
            );
        }
    } catch (error) {
        console.error("[Utils] Guild initialization failed:", error);
    }

    console.log("successfully finished startup");
});


console.log("About to login...");
console.log("TOKEN exists:", !!process.env.TOKEN);
console.log("CLIENT_ID:", process.env.CLIENT_ID);

client.login(process.env.TOKEN)
    .then(() => console.log("login() resolved"))
    .catch(err => console.error("Login failed:", err));
;
client.on("interactionCreate", async (interaction) => {
    if (interaction.isChatInputCommand()) {
        const commandName = interaction.commandName;
        const command = client.slashCommands.get(commandName);
        if (!command)
            return;
        try {
            await command.execute(interaction);
        }
        catch (e) {
            console.log(e);
        }
    }
    else if (interaction.isAutocomplete()) {
        const command = interaction.commandName;
        const sub = interaction.options.getSubcommand(false);
        const group = interaction.options.getSubcommandGroup(false);
        const focused = interaction.options.getFocused(true);
        if (focused.name === "map-name") {
            const maps = registry.getMaps();
            if (!interaction.responded) {
                try {
                    await interaction.respond(maps
                        .filter((map) => map.name.toLocaleLowerCase().includes(focused.value))
                        .slice(0, 10)
                        .map((map) => ({ name: map.name, value: map.name })));
                }
                catch (e) { }
            }
        }
    }
    else if (interaction.isModalSubmit()) {
        const customId = interaction.customId;
        if (customId.startsWith("modal_sendmessage")) {
            const [type, action, gameNumber] = customId.split("_");
            if (!gameNumber)
                return;
            const gameData = await Layer2.getRecentGameData(undefined, undefined, parseInt(gameNumber));
            const packetHandler = gameManager.getGame(gameData?.game_code) ?? gameManager.getLeagueGame(parseInt(gameNumber));
            const text = interaction.fields.getTextInputValue(`modal_message`);
            packetHandler?.sendChat(text);
            await interaction.deferUpdate();
            const mainEmbed = EmbedBuilder.from(interaction.message?.embeds[0]).addFields({
                name: "Action Log",
                value: "Message sent",
            });
            await interaction.editReply({ embeds: [mainEmbed] });
        }
        else if (customId.startsWith("void_")) {
            await interaction.deferUpdate();
            const embed = EmbedBuilder.from(interaction.message.embeds[0]);
            const gameNumber = CustomRegex.getGameNumberHash(embed.data.title);
            const text = interaction.fields.getTextInputValue("void_reason");
            embed.setDescription(text);
            embed.addFields({
                name: "Staff Member",
                value: interaction.user.username,
            });
            await interaction.editReply({ embeds: [embed], components: [] });
            await Layer2.updateGameData(gameNumber, { reason: "Other" });
        }
    }
    else if (interaction.isButton()) {
        try {
            const customId = interaction.customId;
            // console.log(customId);
            // if (interaction.context !== InteractionContextType.Guild) return;
            if (customId.startsWith("void_")) {
                const param = customId.split("_");
                const [, reason, authorId, queueId] = param;
                // if (!reason || !authorId || !queueId) return;
                const member = await Utils.getMember(interaction.guild, interaction.user.id);
                if (!member)
                    return;
                if (member.id !== authorId &&
                    !member.permissions.has(PermissionFlagsBits.Administrator))
                    return;
                const embed = EmbedBuilder.from(interaction.message.embeds[0]);
                const gameNumber = CustomRegex.getGameNumberHash(embed.data.title);
                if (reason !== "other")
                    await interaction.deferUpdate();
                const cancelRow = makeGameVoidCloseButton(authorId, queueId);
                switch (reason) {
                    case "moved":
                        var row = new ActionRowBuilder();
                        var biggerQueues = queuesManager.getBiggerQueues(queueId);
                        for (const queue of biggerQueues) {
                            // const bigId = queue.getChannelId();
                            console.log(bigId);
                            const btn = new ButtonBuilder()
                                .setCustomId(`queue_${bigId}_${authorId}_${queueId}`)
                                .setLabel(queue.getQueueType())
                                .setStyle(ButtonStyle.Primary);
                            row.addComponents(btn);
                        }
                        embed.setDescription("Please choose the queue where the players moved");
                        await interaction.editReply({
                            embeds: [embed],
                            components: [row, cancelRow],
                        });
                        break;
                    case "dodge":
                        // console.log(gameNumber);
                        // if (!gameNumber) return;
                        // var num = parseInt(gameNumber) as number;
                        const gameData = (await Layer2.getRecentGameData(undefined, undefined, gameNumber));
                        const [team1, team2, rem, allPlayers] = await Utils.cleanGameData(gameData);
                        var rowSelect = new ActionRowBuilder();
                        const options = allPlayers.map((id) => {
                            const player = interaction.guild?.members.cache.get(id);
                            return {
                                label: `Player: ${player?.user.username ?? id}`,
                                value: id,
                                description: `ID: ${id}`,
                            };
                        });
                        rowSelect.addComponents(new StringSelectMenuBuilder()
                            .setCustomId(`dodge_${gameNumber}_${authorId}`)
                            .setPlaceholder("Select players")
                            .setMinValues(1)
                            .setMaxValues(allPlayers.length)
                            .addOptions(options));
                        await interaction.editReply({
                            embeds: [embed],
                            components: [rowSelect, cancelRow],
                        });
                        await Layer2.updateGameData(gameNumber, { reason: "Player(s) Dodged" });
                        break;
                    case "other":
                        var modal = new ModalBuilder()
                            .setCustomId(`void_${authorId}`)
                            .setTitle("Void Reason");
                        var messageInput = new TextInputBuilder()
                            .setCustomId("void_reason")
                            .setPlaceholder("Game Void")
                            .setStyle(TextInputStyle.Short);
                        var label = new LabelBuilder()
                            .setLabel("Why was game voided")
                            .setDescription("Give brief explaination")
                            .setTextInputComponent(messageInput);
                        modal.addLabelComponents(label);
                        await interaction.showModal(modal);
                        break;
                    case "back":
                        var title = interaction.message.embeds[0]?.title;
                        var num = CustomRegex.getGameNumberHash(title);
                        var queueType = CustomRegex.getQueueType(title);
                        var [mainEmbed, row1, row2] = makeGameVoidEmbed(num, queueType, authorId, queueId);
                        await interaction.editReply({
                            embeds: [mainEmbed],
                            components: [row1, row2],
                        });
                        break;
                    case "close":
                        if (!member.permissions.has(PermissionFlagsBits.Administrator))
                            return;
                        embed.setDescription(`**Game report was closed by: <@${interaction.user.id}>**`);
                        await interaction.editReply({ components: [], embeds: [embed] });
                        break;
                }
            }
            else if (customId.startsWith("queue_")) {
                await interaction.deferUpdate();
                // console.log('yes')
                const param = customId.split("_");
                const [, newQueueId, authorId, oldQueueId] = param;
                const member = await Utils.getMember(interaction.guild, interaction.user.id);
                if (!member)
                    return;
                if (member.id !== authorId &&
                    !member.permissions.has(PermissionFlagsBits.Administrator))
                    return;
                const embed = EmbedBuilder.from(interaction.message.embeds[0]);
                const embedTitle = embed.data.title;
                const gameNumber = CustomRegex.getGameNumberHash(embedTitle);
                embed.setDescription(`Game was voided as the players moved from <#${oldQueueId}> to <#${newQueueId}>`);
                embed.addFields({
                    name: "Staff Member",
                    value: `${interaction.user.username}`,
                });
                await interaction.editReply({ embeds: [embed], components: [] });
                await Layer2.updateGameData(gameNumber, { reason: "Moved Queues" });
            }
        }
        catch (e) {
            console.trace(e);
        }
    }
    else if (interaction.isStringSelectMenu()) {
        if (interaction.customId.startsWith("dodge_")) {
            const [, gameNumber, userId] = interaction.customId.split("_");
            if (userId !== interaction.user.id)
                return;
            const selectedDodgers = interaction.values;
            const embed = EmbedBuilder.from(interaction.message.embeds[0]).setDescription(`**Game was voided as these players dodged:**\n\n${selectedDodgers
                .map((id) => `<@${id}>`)
                .join("\n")}`);
            embed.addFields({
                name: "Staff Member",
                value: `${interaction.user.username}`,
            });
            await interaction.update({ embeds: [embed], components: [] });
            await Layer2.updateGameData(gameNumber, { reason: "Player(s) Dodged" });
        }
    }
});
client.on("userUpdate", async (oldUser, newUser) => {
    if (oldUser.username !== newUser.username) {
        try {
            const sanitised = Utils.sanitiseUsername(newUser.username);
            await Layer2.updateUsername(newUser.id, sanitised);
        }
        catch (e) {
            console.trace(e);
        }
    }
});