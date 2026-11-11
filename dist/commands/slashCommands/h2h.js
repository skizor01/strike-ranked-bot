import { ActionRowBuilder, ApplicationIntegrationType, ComponentType, InteractionContextType, PermissionFlagsBits, SlashCommandBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, } from "discord.js";
import { makeEmbed, Utils } from "../../utils/others.js";
import path from "node:path";
import { rootPath } from "../../CustomClient.js";
import { loadJSONData } from "../../utils/loadCommands.js";
import { Errors } from "../../types/errors.js";
import { GUN_EMOJIS } from "../../config/index.js";
const serverPath = path.join(rootPath, "storage", "games", "server.json");
const leaguePath = path.join(rootPath, "storage", "games", "league.json");
const command = {
    description: "View Head-to-head stats",
    type: "slash",
    visibility: "Staff",
    data: new SlashCommandBuilder()
        .setName("h2h")
        .setDescription("View Head-to-head stats")
        .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
        .setContexts(InteractionContextType.Guild)
        .addIntegerOption((opt) => opt.setName("game")
        .setDescription("Game Number")
        .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
        await interaction.deferReply();
        const gameNumber = interaction.options.getInteger("game", true);

        const filePath = leaguePath;

        try {
            const allData = await loadJSONData(filePath);
            const h2hData = allData[gameNumber];
            if (!h2hData)
                throw new Error(Errors.gameNotFound);
            const selectEmbed = makeEmbed("Select player", "normalColor", false);
            const opt = new StringSelectMenuBuilder()
                .setCustomId("player")
                .setPlaceholder("Select Player");
            const arr = [];
            Object.keys(h2hData).forEach((key) => {
                const data = h2hData[key];
                arr.push(new StringSelectMenuOptionBuilder()
                    .setLabel(key)
                    .setDescription(`Name: ${data.name}`)
                    .setValue(key));
            });
            opt.addOptions(arr);
            const row = new ActionRowBuilder().addComponents(opt);
            const msg = await interaction.editReply({ embeds: [selectEmbed], components: [row] });
            const collector = msg.createMessageComponentCollector({
                componentType: ComponentType.StringSelect,
                time: 60_000,
            });
            collector.on("collect", async (int) => {
                await int.deferUpdate();
                const pId = int.values[0];
                const data = h2hData[pId];
                const embed = generateEmbed(data);
                await int.followUp({ embeds: [embed] });
            });
            collector.on("end", async () => {
                await msg.edit({ components: [] });
            });
        }
        catch (e) {
            const embed = makeEmbed("Command Error", "error", false);
            if (e instanceof Error) {
                embed.setDescription(e.message);
            }
            await interaction.editReply({ embeds: [embed] });
        }
        // console.log(code)
    },
};
export default command;
function generateEmbed(data) {
    const name = data.name;
    const embed = makeEmbed(`${Utils.sanitiseUsername(name)}'s head-to-head stats`, "normalColor", false);
    const formattedData = {};
    Object.entries(data.kills).forEach(([key, value]) => {
        let counter = 0;
        // console.log(key, value)
        //@ts-ignore
        if (!formattedData[key])
            formattedData[key] = { kills: {}, deaths: {} };
        Object.entries(value).forEach(([weapon, kills]) => {
            formattedData[key].kills[weapon] = kills;
            // console.log(weapon, kills)
            counter += kills;
        });
        formattedData[key].totalKills = counter;
    });
    Object.entries(data.deaths).forEach(([key, value]) => {
        let counter = 0;
        // console.log(key, value)
        //@ts-ignore
        if (!formattedData[key])
            formattedData[key] = { kills: {}, deaths: {} };
        Object.entries(value).forEach(([weapon, deaths]) => {
            formattedData[key].deaths[weapon] = deaths;
            // console.log(weapon, deaths)
            counter += deaths;
        });
        formattedData[key].totalDeaths = counter;
    });
    Object.keys(formattedData).forEach((name) => {
        let data = formattedData[name];
        let details = `Kills (${data.totalKills ?? 0}):\n`;
        Object.keys(data.kills).forEach((weapon) => {
            details += `- ${data.kills[weapon]} ${GUN_EMOJIS[weapon]}\n`;
        });
        details += `Deaths (${data.totalDeaths ?? 0}):\n`;
        Object.keys(data.deaths).forEach((weapon) => {
            details += `- ${data.deaths[weapon]} ${GUN_EMOJIS[weapon]}\n`;
        });
        embed.addFields({
            name: `${name}`,
            value: details,
            inline: true,
        });
    });
    return embed;
}