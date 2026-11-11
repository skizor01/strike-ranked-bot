import fs, { existsSync } from "fs";
import { readFile } from "fs/promises";
import path from "path";
import { pathToFileURL } from "url";
import { decodeJS } from "./wasm/wrapper.js";
import registry from "./Registry.js";

export async function loadCommands(client, dir, slashData) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            if (entry.name === "prefixCommands") {
                await loadCommandFiles(client, fullPath, "prefix", slashData);
            } else if (entry.name === "slashCommands") {
                await loadCommandFiles(client, fullPath, "slash", slashData);
            } else {
                await loadCommands(client, fullPath, slashData);
            }
        } else {
            await loadCommandFiles(client, fullPath, "slash", slashData);
        }
    }
}

async function loadCommandFiles(client, folderPath, type, slashData) {
    const entries = fs.readdirSync(folderPath, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(folderPath, entry.name);

        if (entry.isDirectory()) {
            await loadCommandFiles(client, fullPath, type, slashData);
            continue;
        }

        if (
            !entry.isFile() ||
            (!entry.name.endsWith(".js") && !entry.name.endsWith(".ts"))
        ) {
            continue;
        }

        try {
            const fileUrl = pathToFileURL(fullPath);

            const { default: command } = await import(fileUrl.href);

            if (!command || command.type !== type) continue;

            if (type === "prefix") {
                client.prefixCommands.set(command.name, command);

                command.aliases?.forEach((alias) => {
                    client.prefixCommands.set(alias, command);
                });

                console.log(`[PREFIX] Loaded ${command.name}`);
            } else {
                client.slashCommands.set(command.data.name, command);
                slashData.push(command.data.toJSON());

                console.log(`[SLASH] Loaded ${command.data.name}`);
            }
        } catch (error) {
            console.error(`\n[COMMAND LOAD ERROR] ${fullPath}`);
            console.error(error);
            console.error(error?.stack);
        }
    }
}

export async function loadJSONData(filePath) {
    if (!existsSync(filePath)) {
        throw new Error(`JSON file not found: ${filePath}`);
    }

    const rawData = await readFile(filePath, "utf8");

    if (!rawData.trim()) {
        throw new Error(`JSON file is empty: ${filePath}`);
    }

    try {
        return JSON.parse(rawData);
    } catch (err) {
        console.error(`Failed to parse ${filePath}`);
        console.error(`Length: ${rawData.length}`);
        console.error(rawData.slice(0, 200));
        throw err;
    }
}
function getMaps(code) {
    const match = code.match(/=\s*(\[\{filename.*?\}\])/s);

    if (!match) {
        throw new Error("Failed to extract maps");
    }

    return eval(match[1]);
}

function getItems(code) {
    const match = code.match(/=\s*(\[\{id.*?\}\])/s);

    if (!match) {
        throw new Error("Failed to extract items");
    }

    return eval(match[1]);
}

const mapsPath = path.join(
    import.meta.dirname,
    "../",
    "storage",
    "maps.json"
);

const mapsKOTCPath = path.join(
    import.meta.dirname,
    "../",
    "storage",
    "mapsKOTC.json"
);

const itemsPath = path.join(
    import.meta.dirname,
    "../",
    "storage",
    "items.json"
);

export async function refreshAll() {
    try {
        const maps = [];
        const currentMaps = [];

        const encoded = await (
            await fetch(
                "https://shellshock.io/js/shellshock.js?1767820197"
            )
        ).text();

        const decoded = await decodeJS(encoded, new Date());

        const maps2 = getMaps(decoded);
        const items = getItems(decoded);

        let index = 0;

        for (const map of maps2) {
            map.index = index;

            maps.push(map);

            if (map.name === "Castle") {
                registry.setScrimMap(map);
            }

            index++;
        }

        const mapsInUse = await loadJSONData(mapsKOTCPath);

        const mapHash = new Map(
            maps.map((map) => [map.hash, map])
        );

        for (let i = 0; i < mapsInUse.length; i++) {
            const map = mapsInUse[i];

            if (!map) continue;

            const updatedMap = mapHash.get(map.hash);

            if (updatedMap) {
                mapsInUse[i] = updatedMap;
                currentMaps.push(updatedMap);
            }
        }

        for (const item of items) {
            if (!item.item_data.meshName) continue;

            if (item.item_data.meshName.startsWith("gun_eggk47"))
                item.formattedName = "Eggk47";

            if (item.item_data.meshName.startsWith("gun_m24"))
                item.formattedName = "Crackshot";

            if (item.item_data.meshName.startsWith("gun_aug"))
                item.formattedName = "TriHard";

            if (item.item_data.meshName.startsWith("gun_rpegg"))
                item.formattedName = "Rpegg";

            if (item.item_data.meshName.startsWith("gun_smg"))
                item.formattedName = "Whipper";

            if (item.item_data.meshName.startsWith("gun_csg1"))
                item.formattedName = "FreeRanger";

            if (item.item_data.meshName.startsWith("gun_dozenGauge"))
                item.formattedName = "Scrambler";
        }

        registry.setMaps(maps2);
        registry.setItems(items);
        registry.setMapPool(mapsInUse);

        fs.writeFileSync(
            mapsPath,
            JSON.stringify(maps, null, 2)
        );

        fs.writeFileSync(
            mapsKOTCPath,
            JSON.stringify(mapsInUse, null, 2)
        );

        fs.writeFileSync(
            itemsPath,
            JSON.stringify(items, null, 2)
        );

        console.log("[MAPS] Refresh completed successfully");
    } catch (error) {
        console.error("[REFRESH ERROR]");
        console.error(error);
        console.error(error?.stack);
    }
}

refreshAll();