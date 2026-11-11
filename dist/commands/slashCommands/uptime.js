import {
    ApplicationIntegrationType,
    InteractionContextType,
    SlashCommandBuilder,
    EmbedBuilder,
} from "discord.js";

import colors from "../../config/index.js";
import { pool } from "../../database/index.js";

function formatUptime(seconds) {
    seconds = Math.floor(seconds);

    const months = Math.floor(seconds / (30 * 24 * 60 * 60));
    seconds %= 30 * 24 * 60 * 60;

    const days = Math.floor(seconds / (24 * 60 * 60));
    seconds %= 24 * 60 * 60;

    const hours = Math.floor(seconds / (60 * 60));
    seconds %= 60 * 60;

    const minutes = Math.floor(seconds / 60);
    seconds %= 60;

    const parts = [];

    if (months) parts.push(`${months} month${months > 1 ? "s" : ""}`);
    if (days) parts.push(`${days} day${days > 1 ? "s" : ""}`);
    if (hours) parts.push(`${hours} hour${hours > 1 ? "s" : ""}`);
    if (minutes) parts.push(`${minutes} minute${minutes > 1 ? "s" : ""}`);
    if (seconds) parts.push(`${seconds} second${seconds > 1 ? "s" : ""}`);

    return parts.length ? parts.join(", ") : "0 seconds";
}

const command = {
    description: "Check bot and database status",
    type: "slash",
    visibility: "Users",

    data: new SlashCommandBuilder()
        .setName("uptime")
        .setDescription("Check bot and database status")
        .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
        .setContexts(InteractionContextType.Guild),

    async execute(interaction) {
        await interaction.deferReply();

        try {
            const readStart = Date.now();

            await pool.query("SELECT 1");

            const readLatency = Date.now() - readStart;

            const writeStart = Date.now();

            await pool.query(`
                INSERT INTO latency_test(created_at)
                VALUES (NOW())
            `);

            const writeLatency = Date.now() - writeStart;

            const avgLatency = Math.round(
                (readLatency + writeLatency) / 2
            );

            const embed = new EmbedBuilder()
                .setTitle("Bot Data")
                .setColor(colors.normalColor)
                .setDescription("Bot and Database Status")
                .addFields(
                    {
                        name: "Bot",
                        value:
                            `> Uptime: ${formatUptime(process.uptime())}\n` +
                            `> API Latency: ${interaction.client.ws.ping}ms`,
                    },
                    {
                        name: "Database",
                        value:
                            `> Read: ${readLatency}ms\n` +
                            `> Write: ${writeLatency}ms\n` +
                            `> Average: ${avgLatency}ms`,
                    }
                )
                .setTimestamp();

            await interaction.editReply({
                embeds: [embed],
            });
        } catch (e) {
            console.error(e);

            await interaction.editReply({
                content: "Failed to fetch uptime information.",
            });
        }
    },
};

export default command;