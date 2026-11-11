import {
    ApplicationIntegrationType,
    InteractionContextType,
    PermissionFlagsBits,
    SlashCommandBuilder,
} from "discord.js";

import { makeEmbed } from "../../utils/others.js";
import { seeMaps } from "../../utils/subCommands/maps.js";

const command = {
    description: "View maps",
    type: "slash",
    visibility: "Staff",

    data: new SlashCommandBuilder()
        .setName("maps")
        .setDescription("View all maps")
        .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions(
            PermissionFlagsBits.ManageMessages
        ),

    async execute(interaction) {
        await interaction.deferReply();

        try {
            await seeMaps(interaction);
        } catch (e) {
            if (e instanceof Error) {
                const embed = makeEmbed(
                    "Command Error",
                    "error",
                    true,
                    e.message
                );

                await interaction.editReply({
                    embeds: [embed],
                });
            }
        }
    },
};

export default command;