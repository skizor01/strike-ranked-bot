
import {
    ActionRowBuilder,
    ApplicationIntegrationType,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    LabelBuilder,
    ModalBuilder,
    PermissionFlagsBits,
    SlashCommandBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    TextInputBuilder,
    TextInputStyle,
} from "discord.js";

import { makeEmbed, Utils } from "../../utils/others.js";
import gameManager from "../../utils/GameManager.js";

const guns = [
    "AK-47",
    "Scrambler",
    "Free-Ranger",
    "RPEGG",
    "Whipper",
    "Crackshot",
    "Tri-Hard",
];

const PLAYERS_PER_PAGE = 25;

const command = {
    description: "Control lobby",
    type: "slash",
    visibility: "Staff",

    data: new SlashCommandBuilder()
        .setName("control-lobby")
        .setDescription("Control a lobby")
        .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addIntegerOption((opt) =>
            opt
                .setName("game-id")
                .setDescription("League Game Number")
                .setRequired(true)
        ),

    async execute(interaction) {
        await interaction.deferReply();

        const gameNumber = interaction.options.getInteger("game-id", true);

        try {
            const packetHandler = gameManager.getLeagueGame(gameNumber);

            if (!packetHandler) {
                throw new Error("Game not being tracked");
            }

            const gameMode = packetHandler.packetType;
            const mainComponents = generateMainComponents(
                gameMode === "SCRIM"
            );

            const cancelRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setLabel("Cancel")
                    .setCustomId("cancel_action")
                    .setStyle(ButtonStyle.Danger)
            );

            const mainEmbed = makeMainEmbed(packetHandler);

            const msg = await interaction.editReply({
                embeds: [mainEmbed],
                components: mainComponents,
            });

            const collector = msg.createMessageComponentCollector({
                time: 60_000,
                filter: (i) => i.user.id === interaction.user.id,
            });

            collector.on("collect", async (int) => {
                const customId = int.customId;
                const isButton =
                    int.componentType === ComponentType.Button;
                const isMenu =
                    int.componentType === ComponentType.StringSelect;

                try {
                    // The send-message button must remain un-deferred
                    // so that its modal can be opened.
                    if (customId !== "send_message") {
                        await int.deferUpdate();
                    }

                    // ------------------------------
                    // BUTTON ACTIONS
                    // ------------------------------
                    if (isButton) {
                        // Player dropdown pagination
                        const pageMatch = customId.match(
                            /^(kick_player|disconnect_player)_page_(\d+)$/
                        );

                        if (pageMatch) {
                            const action = pageMatch[1];
                            const page = Number(pageMatch[2]);

                            await msg.edit({
                                components: [
                                    ...createPlayerMenu(
                                        packetHandler,
                                        action,
                                        page
                                    ),
                                    cancelRow,
                                ],
                            });

                            return;
                        }

                        switch (customId) {
                            case "toggle_lobby": {
                                packetHandler.toggleLock();

                                await msg.edit({
                                    embeds: [makeMainEmbed(packetHandler)],
                                    components: mainComponents,
                                });

                                break;
                            }

                            case "kick_player": {
                                const players =
                                    packetHandler.getAllPlayers();

                                if (!players.length) {
                                    await showActionLog(
                                        msg,
                                        packetHandler,
                                        "Map is empty.",
                                        mainComponents
                                    );
                                    return;
                                }

                                await msg.edit({
                                    components: [
                                        ...createPlayerMenu(
                                            packetHandler,
                                            "kick_player",
                                            0
                                        ),
                                        cancelRow,
                                    ],
                                });

                                break;
                            }

                            case "disconnect_player": {
                                const players =
                                    packetHandler.getAllPlayers();

                                if (!players.length) {
                                    await showActionLog(
                                        msg,
                                        packetHandler,
                                        "Map is empty.",
                                        mainComponents
                                    );
                                    return;
                                }

                                await msg.edit({
                                    components: [
                                        ...createPlayerMenu(
                                            packetHandler,
                                            "disconnect_player",
                                            0
                                        ),
                                        cancelRow,
                                    ],
                                });

                                break;
                            }

                            case "toggle_weapon": {
                                const currentConfig =
                                    packetHandler.getConfig();

                                const options =
                                    new StringSelectMenuBuilder()
                                        .setCustomId(
                                            "toggle_weapon_selected"
                                        )
                                        .setPlaceholder("Select weapon");

                                const weaponOptions = [];

                                for (
                                    let i = 0;
                                    i < currentConfig.weaponsDisabled.length;
                                    i++
                                ) {
                                    const name = guns[i];

                                    if (!name) continue;

                                    const disabled =
                                        currentConfig.weaponsDisabled[i];

                                    weaponOptions.push(
                                        new StringSelectMenuOptionBuilder()
                                            .setLabel(name)
                                            .setValue(String(i))
                                            .setDescription(
                                                `${disabled ? "Enable" : "Disable"} ${name}`
                                            )
                                    );
                                }

                                if (!weaponOptions.length) {
                                    await showActionLog(
                                        msg,
                                        packetHandler,
                                        "No weapon settings are available.",
                                        mainComponents
                                    );
                                    return;
                                }

                                options.addOptions(weaponOptions);

                                await msg.edit({
                                    components: [
                                        new ActionRowBuilder().addComponents(
                                            options
                                        ),
                                        cancelRow,
                                    ],
                                });

                                break;
                            }

                            case "reset_lobby": {
                                await packetHandler.resetLobby();

                                await showActionLog(
                                    msg,
                                    packetHandler,
                                    "Lobby reset requested.",
                                    mainComponents
                                );

                                break;
                            }

                            case "leave_lobby": {
                                await packetHandler.leaveLobby();

                                await showActionLog(
                                    msg,
                                    packetHandler,
                                    "Left game.",
                                    []
                                );

                                collector.stop();
                                break;
                            }

                            case "end_collector": {
                                collector.stop();
                                break;
                            }

                            case "cancel_action": {
                                await showActionLog(
                                    msg,
                                    packetHandler,
                                    "Action cancelled.",
                                    mainComponents
                                );

                                break;
                            }

                            case "send_message": {
                                const modal = new ModalBuilder()
                                    .setCustomId(
                                        `modal_sendmessage_${gameNumber}`
                                    )
                                    .setTitle("Send Message");

                                const messageInput =
                                    new TextInputBuilder()
                                        .setCustomId("modal_message")
                                        .setPlaceholder("Message")
                                        .setStyle(TextInputStyle.Short)
                                        .setRequired(true)
                                        .setMaxLength(4000);

                                const messageLabel = new LabelBuilder()
                                    .setLabel("Send a message")
                                    .setDescription("Message to send")
                                    .setTextInputComponent(messageInput);

                                modal.addLabelComponents(messageLabel);

                                await int.showModal(modal);
                                break;
                            }
                        }

                        return;
                    }

                    // ------------------------------
                    // SELECT MENU ACTIONS
                    // ------------------------------
                    if (isMenu) {
                        switch (customId) {
                            case "kick_player_selected": {
                                const uniqueId = int.values[0];

                                const player =
                                    packetHandler
                                        .getAllPlayers()
                                        .find(
                                            (p) =>
                                                String(p.uniqueId_) ===
                                                String(uniqueId)
                                        );

                                if (!player) {
                                    await showActionLog(
                                        msg,
                                        packetHandler,
                                        "Player is no longer in the lobby.",
                                        mainComponents
                                    );
                                    return;
                                }

                                try {
                                    await packetHandler.bootPlayer(uniqueId);

                                    // Refresh the player list after the request.
                                    const stillPresent =
                                        packetHandler
                                            .getAllPlayers()
                                            .some(
                                                (p) =>
                                                    String(p.uniqueId_) ===
                                                    String(uniqueId)
                                            );

                                    await showActionLog(
                                        msg,
                                        packetHandler,
                                        stillPresent
                                            ? `Kick requested for ${player.name_}, but the player is still listed. Check the bootPlayer implementation and server response.`
                                            : `Successfully kicked ${player.name_}.`,
                                        mainComponents
                                    );
                                } catch (error) {
                                    console.error(
                                        "[control-lobby] Failed to kick player:",
                                        error
                                    );

                                    await showActionLog(
                                        msg,
                                        packetHandler,
                                        `Failed to kick ${player.name_}. Check the server logs.`,
                                        mainComponents
                                    );
                                }

                                break;
                            }

                            case "disconnect_player_selected": {
                                const uniqueId = int.values[0];

                                const player =
                                    packetHandler
                                        .getAllPlayers()
                                        .find(
                                            (p) =>
                                                String(p.uniqueId_) ===
                                                String(uniqueId)
                                        );

                                if (!player) {
                                    await showActionLog(
                                        msg,
                                        packetHandler,
                                        "Player is no longer in the lobby.",
                                        mainComponents
                                    );
                                    return;
                                }

                                try {
                                    await packetHandler.disconnectPlayer(
                                        uniqueId
                                    );

                                    await showActionLog(
                                        msg,
                                        packetHandler,
                                        `Disconnect requested for ${player.name_}.`,
                                        mainComponents
                                    );
                                } catch (error) {
                                    console.error(
                                        "[control-lobby] Failed to disconnect player:",
                                        error
                                    );

                                    await showActionLog(
                                        msg,
                                        packetHandler,
                                        `Failed to disconnect ${player.name_}. Check the server logs.`,
                                        mainComponents
                                    );
                                }

                                break;
                            }

                            case "toggle_weapon_selected": {
                                const value = Number.parseInt(
                                    int.values[0],
                                    10
                                );

                                if (
                                    !Number.isInteger(value) ||
                                    value < 0 ||
                                    value >= guns.length
                                ) {
                                    await showActionLog(
                                        msg,
                                        packetHandler,
                                        "Invalid weapon selection.",
                                        mainComponents
                                    );
                                    return;
                                }

                                await packetHandler.toggleWeapon(value);

                                const config = packetHandler.getConfig();
                                const isDisabled =
                                    config.weaponsDisabled[value];

                                await showActionLog(
                                    msg,
                                    packetHandler,
                                    `${guns[value]} is now ${isDisabled ? "disabled" : "enabled"}.`,
                                    mainComponents
                                );

                                break;
                            }
                        }
                    }
                } catch (error) {
                    console.error(
                        "[control-lobby] Component action failed:",
                        error
                    );

                    try {
                        await showActionLog(
                            msg,
                            packetHandler,
                            `Action failed: ${
                                error instanceof Error
                                    ? error.message
                                    : String(error)
                            }`,
                            mainComponents
                        );
                    } catch (editError) {
                        console.error(
                            "[control-lobby] Failed to update action log:",
                            editError
                        );
                    }
                }
            });

            collector.on("end", async () => {
                try {
                    await msg.edit({ components: [] });
                } catch (error) {
                    console.error(
                        "[control-lobby] Failed to clear controls:",
                        error
                    );
                }
            });
        } catch (error) {
            console.error("[control-lobby] Command failed:", error);

            if (error instanceof Error) {
                const embed = makeEmbed(
                    "Command Error",
                    "error",
                    false,
                    error.message
                );

                await interaction.editReply({
                    embeds: [embed],
                    components: [],
                });
            }
        }
    },
};

// ------------------------------------------
// PLAYER MENU WITH PAGINATION
// ------------------------------------------
function createPlayerMenu(packetHandler, action, page = 0) {
    const players = packetHandler.getAllPlayers();

    const totalPages = Math.max(
        1,
        Math.ceil(players.length / PLAYERS_PER_PAGE)
    );

    page = Math.max(0, Math.min(page, totalPages - 1));

    const pagePlayers = players.slice(
        page * PLAYERS_PER_PAGE,
        (page + 1) * PLAYERS_PER_PAGE
    );

    const select = new StringSelectMenuBuilder()
        .setCustomId(`${action}_selected`)
        .setPlaceholder("Select Player");

    select.addOptions(
        pagePlayers.map((player) =>
            new StringSelectMenuOptionBuilder()
                .setLabel(
                    String(player.name_ || "Unknown").slice(0, 100)
                )
                .setDescription(
                    String(player.uniqueId_ || "Unknown ID").slice(0, 100)
                )
                .setValue(String(player.uniqueId_))
        )
    );

    const rows = [
        new ActionRowBuilder().addComponents(select),
    ];

    if (totalPages > 1) {
        const previousPage = new ButtonBuilder()
            .setCustomId(
                `${action}_page_${Math.max(0, page - 1)}`
            )
            .setLabel("Previous")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 0);

        const nextPage = new ButtonBuilder()
            .setCustomId(
                `${action}_page_${Math.min(totalPages - 1, page + 1)}`
            )
            .setLabel("Next")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page >= totalPages - 1);

        rows.push(
            new ActionRowBuilder().addComponents(
                previousPage,
                nextPage
            )
        );
    }

    return rows;
}

// ------------------------------------------
// ACTION LOG
// ------------------------------------------
async function showActionLog(msg, packetHandler, message, components) {
    const embed = makeMainEmbed(packetHandler);

    embed.addFields({
        name: "Action Log",
        value: String(message).slice(0, 1024),
    });

    await msg.edit({
        embeds: [embed],
        components,
    });
}

// ------------------------------------------
// MAIN CONTROL BUTTONS
// ------------------------------------------
function generateMainComponents(isScrim) {
    const toggleLobby = new ButtonBuilder()
        .setLabel("Lock/Unlock lobby")
        .setCustomId("toggle_lobby")
        .setStyle(ButtonStyle.Danger);

    const resetGame = new ButtonBuilder()
        .setLabel("Reset Lobby")
        .setCustomId("reset_lobby")
        .setStyle(ButtonStyle.Danger);

    const toggleWeapons = new ButtonBuilder()
        .setLabel("Enable/Disable weapon")
        .setCustomId("toggle_weapon")
        .setStyle(ButtonStyle.Danger);

    const kickPlayer = new ButtonBuilder()
        .setLabel("Kick Player")
        .setCustomId("kick_player")
        .setStyle(ButtonStyle.Danger);

    const sendMessage = new ButtonBuilder()
        .setLabel("Send Message")
        .setCustomId("send_message")
        .setStyle(ButtonStyle.Primary);

    const disconnectPlayer = new ButtonBuilder()
        .setLabel("DC Player")
        .setCustomId("disconnect_player")
        .setStyle(ButtonStyle.Danger);

    const leaveLobby = new ButtonBuilder()
        .setLabel("Leave Lobby")
        .setCustomId("leave_lobby")
        .setStyle(ButtonStyle.Danger);

    const closeCollector = new ButtonBuilder()
        .setLabel("Stop Configuration")
        .setCustomId("end_collector")
        .setStyle(ButtonStyle.Danger);

    const row1 = new ActionRowBuilder().addComponents(
        toggleLobby,
        toggleWeapons,
        resetGame
    );

    const row2 = new ActionRowBuilder().addComponents(
        kickPlayer,
        sendMessage
    );

    if (isScrim) {
        row2.addComponents(disconnectPlayer);
    }

    const row3 = new ActionRowBuilder().addComponents(
        leaveLobby,
        closeCollector
    );

    return [row1, row2, row3];
}

// ------------------------------------------
// MAIN EMBED
// ------------------------------------------
function makeMainEmbed(packetHandler) {
    const currentConfig = packetHandler.getConfig();

    const lockedWeapons = guns.filter(
        (_, i) => currentConfig.weaponsDisabled[i]
    );

    const mainEmbed = makeEmbed(
        `Game Configuration #${packetHandler.gameNumber}`,
        "normalColor",
        false
    ).setDescription(
        `Map: ${packetHandler.map.name}\n` +
        `Server: ${Utils.getFormattedRegion(packetHandler.region)}\n` +
        `Mode: ${packetHandler.packetType}`
    );

    mainEmbed.setFields(
        {
            name: "Lobby Locked",
            value: Utils.capitaliseWord(
                String(currentConfig.locked)
            ),
        },
        {
            name: "Locked Weapons",
            value: lockedWeapons.length
                ? lockedWeapons.join(", ")
                : "None",
        }
    );

    return mainEmbed;
}

export default command;