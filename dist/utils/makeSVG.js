import path from "node:path";
import { rootPath } from "../CustomClient.js";
import { loadJSONData } from "./loadCommands.js";
import { Canvas, GlobalFonts, Path2D, loadImage } from "@napi-rs/canvas";
import { weaponsURL } from "./game/utils.js";
import { Utils } from "./others.js";
import { Layer2 } from "../database/Layer2.js";

let logoImage = null;

loadImage("/home/container/assets/logo.png")
    .then(img => {
        logoImage = img;
    })
    .catch(() => {});

const svgColors = {
    light: "#ddd",
    dark: "#333",
    gold: "#ca6",
    redalpha: "#d669",
    bluealpha: "#69d9",
    lightalpha: "#ddd1",
};
function escapeXML(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}
// GlobalFonts.registerFromPath(path.join(rootPath, "../", "fonts", "Antonio-Regular.ttf"));
// console.log(path.join(rootPath, "../", "fonts", "Antonio-Regular.ttf"))
const applyText = (canvas, text, baseSize = 12) => {
    const ctx = canvas.getContext("2d");
    const DPR = ctx.getTransform().a; // current scale
    text = escapeXML(text);
    for (let size = baseSize; size >= 6; size--) {
        ctx.font = `normal ${size}px Iter`;
        return ctx.font;
    }
    return `normal ${6}px Iter`;
};
function generateKOTCImage(gameStats, map, blueName = "Blue Team", redName = "Red Team") {
    const DPR = 2;
    const WIDTH = 2000;
    const ROW_HEIGHT = 55;

    const BLUE = "#5C6CFF";
    const RED = "#FF4B4B";

    const bluePlayers = gameStats.filter(p => p.team === 1);
    const redPlayers = gameStats.filter(p => p.team === 2);

    const maxPlayers = Math.max(bluePlayers.length, redPlayers.length);
    const height = 420 + maxPlayers * ROW_HEIGHT;

    const canvas = new Canvas(WIDTH * DPR, height * DPR);
    const ctx = canvas.getContext("2d");

    ctx.scale(DPR, DPR);

    ctx.fillStyle = "#15171C";
    ctx.fillRect(0, 0, WIDTH, height);

    ctx.strokeStyle = BLUE;
    ctx.lineWidth = 8;

    ctx.beginPath();
    ctx.roundRect(4, 4, WIDTH - 8, height - 8, 28);
    ctx.stroke();
    
    if (logoImage) {

    ctx.drawImage(
        logoImage,
        WIDTH - 220,
        10,
        170,
        110
    );
}
    

    const formattedDuration = Utils.formatTime(
        map?.duration ?? 0,
        {
            showUnits: false,
            separator: ":"
        }
    );
    
    const headerText =
        `${map?.region ?? "Unknown"} | ${map?.title ?? ("Game #" + map?.game_number)} | ${map?.map ?? "Unknown"} | ${formattedDuration}`;

    ctx.fillStyle = "#E6E7EA";
    ctx.font = "bold 35px Iter";
    ctx.fillText(headerText, 60, 70);

    drawTeamCard(
        ctx,
        60,
        BLUE,
        blueName,
        map?.blue_score ?? 0,
        bluePlayers
    );

    drawTeamCard(
        ctx,
        1020,
        RED,
        redName,
        map?.red_score ?? 0,
        redPlayers,
        true
    );

    return canvas.toBuffer("image/png");

    function drawTeamCard(
        ctx,
        x,
        color,
        teamName,
        score,
        players,
        right = false
    ) {

        const cardHeight = 200 + players.length * ROW_HEIGHT;

        ctx.fillStyle = color;
        ctx.fillRect(x + 12, 168, 890, 10);

        ctx.fillStyle = "#23252D";

        ctx.beginPath();
        ctx.roundRect(
            x,
            170,
            920,
            cardHeight,
            24
        );
        ctx.fill();

        ctx.fillStyle = color;
        ctx.font = "bold 40px Iter";

        if (!right) {
            ctx.fillText(
                teamName,
                x + 30,
                225
            );

            ctx.fillText(
                String(score),
                x + 820,
                225
            );
        } else {
            ctx.fillText(
                String(score),
                x + 80,
                225
            );

            ctx.textAlign = "right";

            ctx.fillText(
                teamName,
                x + 830,
                225
            );

            ctx.textAlign = "left";
        }

        ctx.fillRect(x, 245, 920, 4);
        ctx.fillRect(x, 285, 920, 4);

        drawColumnHeaders(ctx, x);

        players.forEach((p, i) =>
            drawPlayer(
                ctx,
                p,
                i,
                x,
                color
            )
        );
    }

    function drawColumnHeaders(ctx, x) {

        ctx.fillStyle =
            "rgba(255,255,255,.05)";

        ctx.fillRect(
            x,
            250,
            920,
            40
        );

        ctx.fillStyle = "#FFF";
        ctx.font = "19px Iter";

        ctx.fillText(
            "PLAYER",
            x + 65,
            275
        );

        centerText(
            "KILLS",
            x + 355,
            275
        );

        centerText(
            "DEATHS",
            x + 500,
            275
        );

        centerText(
            "KDR",
            x + 633,
            275
        );

        centerText(
            "TIME",
            x + 740,
            275
        );

        centerText(
            "CAP | TAK",
            x + 850,
            275
        );
    }

    function drawPlayer(
        ctx,
        p,
        i,
        x,
        color
    ) {

        const y =
            320 + i * ROW_HEIGHT;

        ctx.strokeStyle =
            "#2B2D31";

        ctx.beginPath();

        ctx.moveTo(
            x + 20,
            y + 22
        );

        ctx.lineTo(
            x + 900,
            y + 22
        );

        ctx.stroke();

        const gunPath =
            weaponsURL[p.weapon];

        if (gunPath) {

            const gun =
                new Path2D(gunPath);

            ctx.save();

            ctx.translate(
                x + 20,
                y - 20
            );

            ctx.scale(
                0.28,
                0.28
            );

            ctx.fillStyle =
                "#E6E7EA";

            ctx.fill(gun);

            ctx.restore();
        }

        ctx.fillStyle = color;
        ctx.font =
            "bold 24px Iter";

        ctx.fillText(
            p.name,
            x + 70,
            y
        );

        ctx.fillStyle =
            "#E6E7EA";

        centerText(
           `${p.kills} (${p.killsoncoop || 0})`,
           x + 355,
           y
        );

        centerText(
           `${p.deaths} (${p.deathsoncoop || 0})`,
           x + 500,
           y
        );

        const kdr =
            p.deaths
                ? (
                    p.kills /
                    p.deaths
                  ).toFixed(2)
                : "∞";

        centerText(
            kdr,
            x + 633,
            y
        );

        centerText(
            Utils.formatTime(
                Number(
                    p.totalcooptime || 0
                ),
                {
                    separator: ":",
                    showUnits: false
                }
            ),
            x + 740,
            y
        );

        centerText(
            `${p.cap} | ${p.tak}`,
            x + 854,
            y
        );
    }

    function centerText(
        text,
        x,
        y
    ) {
        ctx.textAlign =
            "center";

        ctx.fillText(
            text,
            x,
            y
        );

        ctx.textAlign =
            "left";
    }
}
export async function getKotcImage(gameNumber) {
    // const kotcPath = path.join(rootPath, "storage", "games", "serverKOTC.json");
    // const allGames = await loadJSONData<KOTCStats>(kotcPath);
    const gameDetails = (await Layer2.getKOTCMap(gameNumber, "server_kotc"))[0];
    const gameStats = await Layer2.getKOTCStats(gameNumber, "server_kotc_stats");
    if (!gameStats)
        throw new Error("No saved stats for this game");
    const img = generateKOTCImage(gameStats, gameDetails);
    return img;
}
export async function getLeagueKOTC(gameNumber) {
    try {
        // const kotcPath = path.join(rootPath, "storage", "games", "leagueKOTC.json");
        const gameDetails = (await Layer2.getKOTCMap(gameNumber, "league_kotc"))[0];
        const gameStats = await Layer2.getKOTCStats(gameNumber, "league_kotc_stats");
        if (!gameStats || !gameDetails)
            throw new Error("No saved stats for this game");
        const img = generateKOTCImage(gameStats, gameDetails);
        return img;
    }
    catch (e) {
        console.trace(e);
    }
}