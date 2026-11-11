import { makeEmbed, Utils } from "../others.js";
import registry from "../Registry.js";
export async function seeMaps(interaction) {
    const kotc = interaction.options.getBoolean("kotc-only", false) ?? false;
    const maps = kotc ? registry.getMaps().filter((map) => map.modes.King) : registry.getMaps();
    let currentPage = 1;
    const perPage = 10;
    const fields = [];
    for (const data of maps) {
        fields.push({
            name: data.name,
            value: `Index: ${data.index} - Size: ${data.numPlayers} ${kotc ? "" : `- KOTC: ${data.modes.King}`}`,
        });
    }
    Utils.paginate({
        currentPage,
        perPage,
        totalData: [...maps],
        embedData: { title: kotc ? "KOTC Maps" : "All Maps" },
        extended: true,
        fields,
        channel: interaction.channel,
    });
}
export async function seePool(interaction) {
    const maps = registry.getCurrentMapPool();
    const embed = makeEmbed("KOTC Map Pool", "normalColor", false).setFields(maps.map((map) => ({
        name: map.name,
        value: `Index: ${map.index} - Size: ${map.numPlayers}`,
    })));
    await interaction.editReply({ embeds: [embed] });
}
export async function addMap(interaction) {
    if (!interaction.memberPermissions?.has("Administrator")) {
        throw new Error("Only admins can use thi command");
    }
    const newMapname = interaction.options.getString("map-name", true);
    const pool = registry.getCurrentMapPool();
    const newMap = registry.getMaps().find(map => map.name === newMapname);
    if (!newMap)
        throw new Error(`Map not found (${newMapname})`);
    if (pool.find(map => map.name === newMapname))
        throw new Error(`Map already in pool (${newMapname})`);
    registry.setMapPool([...pool, newMap]);
    await interaction.editReply(`${newMapname} has been succesfully added to the pool`);
}
export async function removeMap(interaction) {
    if (!interaction.memberPermissions?.has("Administrator")) {
        throw new Error("Only admins can use thi command");
    }
    const oldMapName = interaction.options.getString("map-name", true);
    const pool = registry.getCurrentMapPool();
    const oldMap = registry.getMaps().find(map => map.name === oldMapName);
    if (!oldMap)
        throw new Error(`Map not found (${oldMapName})`);
    if (!pool.find(map => map.name === oldMapName))
        throw new Error(`Map not in pool (${oldMapName})`);
    registry.setMapPool(pool.filter(map => map.name !== oldMap.name));
    await interaction.editReply(`${oldMapName} has been succesfully removed to the pool`);
}
