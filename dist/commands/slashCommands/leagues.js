import { ActionRowBuilder, ApplicationIntegrationType, AttachmentBuilder, ButtonBuilder, ButtonStyle, ChatInputCommandInteraction, ComponentType, GuildMember, PermissionFlagsBits, SlashCommandBuilder, TextChannel, VoiceState, } from "discord.js";
import { makeEmbed, Utils } from "../../utils/others.js";
import { Servers } from "../../types/smallTypes.js";
import registry from "../../utils/Registry.js";
import path from "node:path";
import fs from "node:fs";
import { rootPath } from "../../CustomClient.js";
import { loadJSONData } from "../../utils/loadCommands.js";
import { makeAccount } from "../../utils/login.js";
import MatchMaker from "../../utils/matchmaker/matchmaker.js";
import { GameMode } from "../../utils/game/index.js";
import gameManager from "../../utils/GameManager.js";
import { Errors } from "../../types/errors.js";
import { getLeagueKOTC } from "../../utils/makeSVG.js";
import { error } from "node:console";
import { Layer2 } from "../../database/Layer2.js";
// this is used to get game code of an active league game
const activeLeagueGames = new Map();
const command = {
    description: "Commands for leagues",
    type: "slash",
    visibility: "Staff",
    requiredRoles: ["Admin"],
    data: new SlashCommandBuilder()
        .setName("leagues")
        .setDescription("Commands for leagues")
        .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand((sub) => sub
        .setName("kotc-map")
        .setDescription("Create KOTC Map")
        .addStringOption((opt) => opt
        .setName("server")
        .setDescription("Server of the map")
        .setRequired(true)
        .addChoices(...Object.entries(Servers).map(([name, value]) => ({
        name,
        value,
    }))))
        .addStringOption((opt) => opt
        .setName("map-name")
        .setDescription("Name of the map")
        .setRequired(true)
        .setAutocomplete(true))
        .addStringOption((opt) => opt.setName("team1").setDescription("Team 1 name").setRequired(true))
        .addStringOption((opt) => opt.setName("team2").setDescription("Team 2 name").setRequired(true)))
        .addSubcommand((sub) => sub
        .setName("get-stats")
        .setDescription("Get Stats of a saved game")
        .addIntegerOption((opt) => opt.setName("game").setDescription("Game ID").setRequired(true)))
        .addSubcommand((sub) => sub
        .setName("live-stats")
        .setDescription("Get Live-Stats of a game")
        .addIntegerOption((opt) => opt.setName("game").setDescription("Game ID").setRequired(true))),
    async execute(interaction) {
        await interaction.deferReply();
        const filePath = path.join(rootPath, "storage", "games", "leagueKOTC.json");
        try {
            if (interaction.channel?.id !== "1512296507938705408") {
                throw new Error("Command limited to <#1512296507938705408>");
            }
            const subCommand = interaction.options.getSubcommand(true);
            if (subCommand === "kotc-map") {
                const team1 = interaction.options.getString("team1", true);
                const team2 = interaction.options.getString("team2", true);
                const server = interaction.options.getString("server", true);
                const mapName = interaction.options.getString("map-name", true);
                const map = registry.getMaps().find((map) => map.name === mapName);
                if (!map)
                    throw new Error(`Could not find map (${mapName})`);
                const formattedServer = Utils.getFormattedRegion(server);
                if (!map.modes.King)
                    throw new Error(`Cannot play KOTC on this map (${map.name})`);
                const gid = await Layer2.insertKOTC({
                    map: map.name,
                    region: Utils.getFormattedRegion(server),
                    title: `${team1} vs ${team2}`,
                }, "league_kotc");
                const account = await makeAccount();
                const matchmaker = new MatchMaker({
                    channel: interaction.channel,
                    firebaseId: account.firebaseId,
                    gameNumber: gid ?? 0,
                    session: account.session,
                    sessionId: account.sessionId,
                });
                await matchmaker.init();
                matchmaker.createLeagueKOTC(map, server, GameMode.KOTC, "LeagueKOTC", team1, team2);
                const code = await matchmaker.waitForCode();
                const embed = makeEmbed("League Game", "normalColor", true, `**ID: ${gid}**`)
                    .addFields({
                    name: "Server",
                    value: formattedServer,
                }, {
                    name: "Map",
                    value: `Name: ${mapName}\nMax Players: ${map.numPlayers}`,
                }, {
                    name: "Code",
                    value: code,
                })
                    .setFooter({ text: `By: ${interaction.user.username}` });
                await interaction.editReply({ embeds: [embed] });

                await matchmaker.packetHandler.waitForInit();

                const packetHandler = matchmaker.packetHandler;

// TRACK THE GAME
                gameManager.trackLeagueGame(gid, packetHandler);

                console.log(
                `[LEAGUE TRACKING] Game ${gid} tracked. Current tracked games:`,
                [...gameManager.leagueGames.keys()]
                );

                await Utils.delay(20000);

                const liveStats = packetHandler.getLiveStats();
                if (liveStats) {
                    const liveStatsChannel = await Utils.getChannel("1352787812516233246");
                    if (!liveStatsChannel)
                        return;
                    const row = new ActionRowBuilder().addComponents(new ButtonBuilder()
                        .setCustomId("refresh")
                        .setEmoji("♻️")
                        .setStyle(ButtonStyle.Secondary));
                    const msg = await liveStatsChannel.send({
                        embeds: [liveStats],
                        components: [row],
                    });
                    const collector = msg.createMessageComponentCollector({
                        componentType: ComponentType.Button,
                    });
                    collector.on("collect", async (int) => {
                        await int.deferUpdate();
                        const embed = packetHandler.getLiveStats();
                        if (!embed)
                            return;
                        await msg.edit({ embeds: [embed] });
                    });
                }
            }
            else if (subCommand === "get-stats") {
                const gameId = interaction.options.getInteger("game", true);
                const img = await getLeagueKOTC(gameId);
                const att = new AttachmentBuilder(img, { name: "image.png" });
                await interaction.editReply({ files: [att] });
            }
            else if (subCommand === "live-stats") {
                const gameId = interaction.options.getInteger("game", true);
                await getLiveStatsLeague(interaction, gameId);
            }
        }
        catch (e) {
            if (e instanceof Error) {
                const embed = makeEmbed("Command Error", "error", true, e.message);
                await interaction.editReply({ embeds: [embed] });
            }
        }
    },
};
export async function getLiveStatsLeague(interaction, gameId) {
    const packetHandler = gameManager.getLeagueGame(gameId);
    if (!packetHandler)
        throw new Error("Game not being tracked");
    const liveStats = packetHandler.getLiveStats();
    if (liveStats) {
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder()
            .setCustomId("refresh")
            .setEmoji("♻️")
            .setStyle(ButtonStyle.Secondary));
        const msg = await interaction.editReply({ embeds: [liveStats], components: [row] });
        const collector = msg.createMessageComponentCollector({
            componentType: ComponentType.Button,
        });
        collector.on("collect", async (int) => {
            await int.deferUpdate();
            const embed = packetHandler.getLiveStats();
            if (!embed)
                return;
            await msg.edit({ embeds: [embed] });
        });
    }
}
export default command;