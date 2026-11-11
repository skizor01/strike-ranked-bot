import nodeCron from "node-cron";
import { Pool } from "pg";
import {} from "../types/database.js";
import { RANK_ROLE_IDS } from "../config/index.js";
import dns from "node:dns";

dns.setDefaultResultOrder("ipv4first");

// const poolConfig: PoolConfig = {
// 	connectionString: process.env.DATABASE_URL,
// 	ssl: false,
// 	idleTimeoutMillis: 5 * 60 * 1000, // 30 minutes
// 	connectionTimeoutMillis: 5000, // 5 seconds
// };
// export const pool = new Pool(poolConfig);
export const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});
// export const pool = new Pool({
// 	host: "localhost",
// 	port: 5432,
// 	user: "postgres",
// 	password: "root", // must be a string
// 	database: "sd test",
// 	ssl: false,
// });
nodeCron.schedule("0 0 * * 1", async () => {
    await pool.query("TRUNCATE weekly_stats;");
    await pool.query(`
        INSERT INTO weekly_stats (user_id, season_id, elo, wins, losses, games_played)
        SELECT user_id, season_id, elo, wins, losses, games_played
        FROM user_stats
        WHERE season_id = (
          SELECT season_id 
          FROM seasons 
          WHERE current_ssn = true
        )
      `);
}, { timezone: "Europe/London" });
class DatabaseClass {
    pool;
    constructor(pool) {
        this.pool = pool;
    }
    async getData(str, params) {
        const res = await this.pool.query(str, params);
        return res.rows;
    }
    async getWeeklyData(userId) {
        return this.getData("SELECT * FROM weekly_stats WHERE user_id = $1", [userId]);
    }
    async getUserStats(userId, current, season) {
        const ssn = current
            ? `(
			SELECT season_id
			FROM seasons
			WHERE current_ssn = true
			)`
            : "$2";
        const params = current ? [userId] : [userId, season];
        return this.getData(`
		WITH ranked_users AS (
			SELECT
				us.*,
				ROW_NUMBER() OVER (ORDER BY elo DESC)            AS elo_rank,
				ROW_NUMBER() OVER (ORDER BY games_played DESC)   AS games_played_rank,
				ROW_NUMBER() OVER (ORDER BY wins DESC)           AS wins_rank,
				ROW_NUMBER() OVER (ORDER BY losses DESC)         AS losses_rank,
				ROW_NUMBER() OVER (ORDER BY wlr DESC)            AS wlr_rank,
				COUNT(*) OVER (PARTITION BY us.season_id = ${ssn}) as total_rows
			FROM public.user_stats us
			WHERE season_id = ${ssn}
		)
		SELECT *
		FROM ranked_users
		WHERE user_id = $1;`, params);
    }
    async getRefStats(userId, season) {
        const currentSSn = await this.getCurrentSeason();
        const ssn = season ?? currentSSn.season_id;
        const stats = await this.getData(`SELECT * FROM ref_stats WHERE user_id = $1 AND season_id = $2`, [userId, ssn]);
        return stats[0];
    }
    async getUserQueueStats(userId) {
        return this.getData(`
			SELECT 
				g.queue_type as "Queue Type",
				COUNT(DISTINCT g.game_number) AS "Total Games"
			FROM games g
			JOIN game_players gp 
			ON g.game_number = gp.game_id
			WHERE (g.captain1 = $1
				OR g.captain2 = $1
				OR gp.user_id = $1)
			AND g.status != 'Voided'
			GROUP BY g.queue_type
			ORDER BY "Total Games" DESC;
			`, [userId]);
    }
    async getUserOverallStats(userId) {
        return this.getData(`
				SELECT SUM(us.games_played) as "Total Games",
				ARRAY_AGG(DISTINCT us.season_id ORDER BY us.season_id) AS "Seasons",
				SUM(us.elo) as "Total ELO",
				SUM(us.wins) as "Total Wins",
				SUM(us.losses) as "Total Losses",
				ROUND((SUM(us.wins) * 1.0 / NULLIF(SUM(us.losses), 0)), 2) AS "Overall WLR"
				FROM user_stats us
				WHERE us.user_id = $1
				GROUP BY us.user_id;
			`, [userId]);
    }
    async getLeaderboard(mode, page, currentSSn = true) {
        const ssn = currentSSn === true
            ? `(
			SELECT season_id
			FROM seasons
			WHERE current_ssn = true
			)`
            : "$2";
        const perPage = 10;
        let data;
        const args = [];
        if (Number.isInteger(currentSSn))
            args.push(currentSSn);
        if (["undos", "bans"].includes(mode)) {
            data = await this.getData(`
					SELECT u.username, rs.*,
					ROW_NUMBER() OVER (ORDER BY rs.${mode} DESC) as Ranking,
					COUNT(*) OVER (PARTITION BY rs.season_id = ${ssn}) as total_rows
					FROM users u
					JOIN ref_stats rs ON rs.user_id = u.user_id
					WHERE season_id = (
						SELECT season_id
						FROM seasons
						WHERE current_ssn = true
					)
					ORDER BY rs.${mode} DESC
					OFFSET ${page * perPage}
					LIMIT 10;
				`);
        }
        else if (mode === "calls" || mode === "voids") {
            const formatted = {
                calls: "Called",
                voids: "Voided",
            };
            data = await this.getData(`
					SELECT u.username,
					COUNT(g) as ${mode},
					ROW_NUMBER() OVER (ORDER BY COUNT(*) DESC) as ranking,
					COUNT(*) OVER() AS "total_rows"
					FROM users u
					JOIN games g ON u.user_id = g.by_user
					WHERE g.status = '${formatted[mode]}'
					GROUP BY u.username, g.status
					ORDER BY ${mode} DESC
					OFFSET ${page * perPage}
					LIMIT 10;
				`);
        }
        else {
            let caster = mode === "wlr" ? "string" : "float";
            data = await this.getData(`
					SELECT u.username, us.*,
					ROW_NUMBER() OVER (ORDER BY us.${mode} DESC) as Ranking,
					COUNT(*) OVER (PARTITION BY us.season_id = ${ssn} AND us.${mode}::float > 0) as total_rows
					FROM user_stats us
					JOIN users u ON u.user_id = us.user_id
					WHERE season_id = (
						SELECT season_id
						FROM seasons
						WHERE current_ssn = true
					) AND us.${mode}::float > 0
					ORDER BY us.${mode} DESC
					OFFSET ${perPage * page}
					LIMIT 10;
				`);
        }
        // console.log(data)
        return data;
    }
    async getWeeklyLb(mode, page) {
        const perPage = 10;
        let calculation = `us.${mode} - ws.${mode}`;
        if (mode === "wlr")
            calculation = `((us.wins - ws.wins) / COALESCE(NULLIF((us.losses - ws.losses), 0), 1))::numeric(10,2)`;
        return this.getData(`
				SELECT u.username, ${calculation} as ${mode},
				ROW_NUMBER() OVER (ORDER BY ${calculation} DESC) as Ranking,
				COUNT(*) OVER (PARTITION BY us.${mode}::float > 0) as total_rows
				FROM weekly_stats ws
				JOIN user_stats us ON ws.user_id = us.user_id AND ws.season_id = us.season_id
				JOIN users u ON us.user_id = u.user_id
				WHERE ${calculation}::float > 0
				ORDER BY ${mode} DESC
				OFFSET ${perPage * page} LIMIT 10;
			`);
    }
    async getAllSeasons() {
        return this.getData("SELECT season_id, current_ssn FROM seasons");
    }
    async getCurrentSeason() {
        const season = await this.getData("SELECT * FROM seasons WHERE current_ssn = true");
        return season[0];
    }
    async getAllUsers(seasonId) {
        return this.getData("SELECT * FROM user_stats WHERE season_id = $1", [seasonId]);
    }
    async getLatestGameNumber(offset = 0) {
        const res = await this.getData(`
				SELECT game_number
				FROM games
				ORDER BY game_number DESC
				OFFSET $1
				LIMIT 1
			`, [offset]);
        return res[0].game_number;
    }
    async getRecentGameData(offset) {
        return this.getData(`
				SELECT
				g.*,
				COALESCE(
					json_agg(
						json_build_object(
							'user_id', gp.user_id,
							'team', gp.team,
							'order', gp.pick_order
						)
						ORDER BY gp.pick_order
					) FILTER (WHERE gp.user_id IS NOT NULL),
					'[]'::json
				) AS players
				FROM games g
				LEFT JOIN game_players gp
				ON g.game_number = gp.game_id
				GROUP BY g.game_number
				ORDER BY g.game_number DESC
				LIMIT 1 OFFSET $1
			`, [offset]);
    }
    async getGameDataByNumber(gameNumber) {
        return this.getData(`
				    SELECT
					g.*,
					COALESCE(
						json_agg(
						json_build_object(
							'user_id', gp.user_id,
							'team', gp.team,
							'order', gp.pick_order
						)
						ORDER BY gp.pick_order
						) FILTER (WHERE gp.user_id IS NOT NULL),
						'[]'::json
					) AS players
					FROM games g
					LEFT JOIN game_players gp
					ON g.game_number = gp.game_id
					WHERE g.game_number = $1
					GROUP BY g.game_number
			`, [gameNumber]);
    }
    async getGameDataByQueue(queueType) {
        return this.getData(`
				    SELECT
					g.*,
					COALESCE(
						json_agg(
						json_build_object(
							'user_id', gp.user_id,
							'team', gp.team,
							'order', gp.pick_order
						)
						ORDER BY gp.pick_order
						) FILTER (WHERE gp.user_id IS NOT NULL),
						'[]'::json
					) AS players
					FROM games g
					LEFT JOIN game_players gp
					ON g.game_number = gp.game_id
					WHERE g.queue_type = $1
					GROUP BY g.game_number
					ORDER BY g.game_number DESC
					LIMIT 1
			`, [queueType]);
    }
    async getGameDataByUser(userId, page, maxGamesBack) {
        const perPage = 10;
        const offset = (page - 1) * perPage;
        const data = await this.getData(`
			WITH games AS (
				SELECT DISTINCT
					g.game_number,
					g.queue_type,
					g.status,
					g.by_user,
					g.game_code,
					u.username
				FROM (
					SELECT *
					FROM games
					ORDER BY game_number DESC
					LIMIT $4
				) g
				LEFT JOIN game_players gp ON gp.game_id = g.game_number
				LEFT JOIN users u ON u.user_id = g.by_user
				WHERE (
					g.captain1 = $1
					OR g.captain2 = $1
					OR gp.user_id = $1
				)
				ORDER BY g.game_number DESC
				)
				SELECT *,
				COUNT(*) OVER() AS total_rows
				FROM games
				LIMIT $2 OFFSET $3;
		`, [userId, perPage, offset, maxGamesBack]);
        return data;
    }
    async getGameReport() {
        const res = await this.getData(`
			SELECT 'status' AS type, status AS key, COUNT(*)::int as count
        FROM games
        GROUP BY status

		UNION ALL
		SELECT 'reason' AS type, reason AS key, COUNT(*)::int AS count
		FROM GAMES
		GROUP BY reason;`);
        return res;
    }
    async getBanDetails(userId) {
        const data = await this.getData("SELECT * FROM queue_bans WHERE user_id = $1", [
            userId,
        ]);
        return data[0];
    }
    async finalEloRanking(seasonId) {
        const data = await this.getData(`
		SELECT us.*, u.username
        FROM user_stats us
        JOIN users u ON u.user_id = us.user_id
        WHERE us.season_id = $1
        ORDER BY us.elo DESC
        LIMIT 10`, [seasonId]);
        return data;
    }
    async finalGamesPlayed(seasonId) {
        const data = await this.getData(`
		SELECT us.*, u.username
        FROM user_stats us
        JOIN users u ON u.user_id = us.user_id
        WHERE us.season_id = $1
        ORDER BY us.games_played DESC
        LIMIT 10`, [seasonId]);
        return data;
    }
    async finalWinsRanking(seasonId) {
        return this.getData(`
		SELECT us.*, u.username
        FROM user_stats us
        JOIN users u ON u.user_id = us.user_id
        WHERE us.season_id = $1
        ORDER BY us.wins DESC
        LIMIT 10`, [seasonId]);
    }
    async finalLossesRanking(seasonId) {
        return this.getData(`
		SELECT us.*, u.username
        FROM user_stats us
        JOIN users u ON u.user_id = us.user_id
        WHERE us.season_id = $1
        ORDER BY us.losses DESC
        LIMIT 10`, [seasonId]);
    }
    async finalWLRRanking(seasonId) {
        return this.getData(`
		SELECT us.*, u.username, ROUND(COALESCE((us.wins * 1.0 / NULLIF(us.losses, 0)), 0), 2) AS wlr
        FROM user_stats us
        JOIN users u ON u.user_id = us.user_id
        WHERE us.season_id = $1
        ORDER BY (us.wins * 1.0 / NULLIF(us.losses, 0)) DESC NULLS LAST
        LIMIT 10`, [seasonId]);
    }
    async registerUser(userId, username, roleId) {
        const client = await this.pool.connect();
        await this.performQuery(client, "INSERT INTO users (user_id, reg_time, username) VALUES ($1, $2, $3)", [userId, new Date(), username]).catch(() => { console.log("already in users"); });
        await this.performQuery(client, `
			INSERT INTO user_stats (user_id, season_id, rank_id, wlr)
			VALUES ($1, (SELECT season_id FROM seasons WHERE current_ssn = true), $2, 0.00)
			`, [userId, roleId]);
        client.release();
    }
    async isUserRegistered(userId) {
        const res = await this.getData(`SELECT * FROM users WHERE user_id = $1`, [userId]);
        if (res.length > 0)
            return true;
        return false;
    }
    async insertInitialGameData(players, queueType, captain1, captain2) {
        const client = await this.pool.connect();
        try {
            await client.query("BEGIN");
            const res = await client.query(`
        INSERT INTO games (queue_type, captain1, captain2, game_number)
        VALUES ($1, $2, $3, (SELECT MAX(game_number + 1) FROM games))
        RETURNING game_number
      `, [queueType, captain1, captain2]);
            const gameNumber = res.rows[0].game_number;
            if (players.length > 0) {
                await client.query(`
          INSERT INTO game_players (game_id, user_id, pick_order)
          SELECT $1, unnest($2::text[]), 0
        `, [gameNumber, players]);
            }
            await client.query("COMMIT");
            return gameNumber;
        }
        catch (e) {
            await client.query("ROLLBACK");
            console.trace(e);
            throw e;
        }
        finally {
            client.release();
        }
    }
    async shuffleGame(cap1, cap2, remainingPlayers, gameNumber, votes, increaseCounter) {
        const client = await this.pool.connect();
        await client.query("BEGIN");
        if (votes.no.size >= votes.yes.size) {
            try {
                await client.query(`UPDATE games SET shuffle_count = ${increaseCounter ? "games.shuffle_count + 1" : "games.shuffle_count"} WHERE game_number = $1`, [gameNumber]);
                await client.query("COMMIT");
                return false;
            }
            catch (e) {
                await client.query("ROLLBACK");
                console.trace(e);
            }
            finally {
                client.release();
            }
        }
        try {
            await client.query(`
				UPDATE games
				SET captain1 = $1,
					captain2 = $2,
					current_captains_turn = 'Captain 1',
					pick2_players = false,
					current_picks = 0,
					shuffle_count = ${increaseCounter ? "shuffle_count + 1" : "shuffle_count"}
				WHERE game_number = $3
			`, [cap1, cap2, gameNumber]);
            await client.query("DELETE FROM game_players WHERE game_id = $1", [gameNumber]);
            if (remainingPlayers.length > 0) {
                const values = remainingPlayers
                    .map((_, i) => `($1, $${i + 2}, 'remaining', 0)`)
                    .join(",");
                await client.query(`
          INSERT INTO game_players (game_id, user_id, team, pick_order)
          VALUES ${values}
        `, [gameNumber, ...remainingPlayers]);
            }
            await client.query("COMMIT");
            return true;
        }
        catch (e) {
            await client.query("ROLLBACK");
            console.trace(e);
            throw e;
        }
        finally {
            client.release();
        }
    }
    async pickPlayers(pick2_players, current_picks, current_captains_turn, status, gameNumber, team1, team2) {
        const client = await this.pool.connect();
        await client.query("BEGIN");
        try {
            await client.query(`
				UPDATE games SET pick2_players = $1, current_picks = $2, current_captains_turn = $3, status = $4
				WHERE game_number = $5`, [pick2_players, current_picks, current_captains_turn, status, gameNumber]);
            await client.query(`
				UPDATE game_players
				SET team = CASE
					WHEN user_id = ANY($1) THEN 'team1'
					WHEN user_id = ANY($2) THEN 'team2'
					ELSE 'remaining'
				END
				WHERE game_id = $3
				`, [team1, team2, gameNumber]);
            await client.query("COMMIT");
        }
        catch (e) {
            console.trace(e);
            await client.query("ROLLBACK");
            throw new Error("Somethiing went wrong...");
        }
        finally {
            client.release();
        }
    }
    async updateUserStats(userStats, newObj) {
        const client = await this.pool.connect();
        await client.query("BEGIN");
        const keys = Object.keys(newObj);
        const values = Object.values(newObj);
        const clauses = keys.map((k, index) => `${k} = $${index + 3}`).join(", ");
        const query = `UPDATE user_stats SET ${clauses} WHERE season_id = $1 AND user_id = $2`;
        // console.log(query)
        try {
            client.query(query, [userStats.season_id, userStats.user_id, ...values]);
            await client.query("COMMIT");
        }
        catch (e) {
            // console.log(query)
            console.trace(e);
            await client.query("ROLLBACK");
        }
        finally {
            client.release();
        }
    }
    async updateRefStats(userId, newStats) {
        const keys = Object.keys(newStats);
        const values = Object.values(newStats);
        const clauses = keys.map((k, index) => `${k} = $${index + 3}`).join(", ");
        const insertPlaceholders = keys.map((_, i) => `$${i + 1}`).join(", ");
        const conflictKeys = new Set(["user_id", "season_id"]);
        const updateClauses = keys
            .filter((k) => !conflictKeys.has(k))
            .map((k) => `${k} = EXCLUDED.${k}`)
            .join(", ");
        const client = await this.pool.connect();
        await client.query("BEGIN");
        try {
            await client.query(`
				INSERT INTO ref_stats (${keys.join(", ")})
				VALUES (${insertPlaceholders})
				ON CONFLICT (user_id, season_id)
				DO UPDATE SET ${updateClauses}`, [...values]);
            // await client.query(
            // 	`UPDATE ref_stats SET ${clauses} WHERE user_id = $1 AND season_id = $2`,
            // 	[userId, newStats.season_id, ...values]
            // );
            await client.query("COMMIT");
        }
        catch (e) {
            console.trace(`[DATABASE] ${e}`);
            await client.query("ROLLBACK");
        }
        finally {
            client.release();
        }
    }
    async updateGameData(gameNumber, newData) {
        const client = await this.pool.connect();
        await client.query("BEGIN");
        try {
            const keysToUpdate = Object.keys(newData).filter((k) => k !== "players");
            const values = Object.values(newData).filter((data) => typeof data !== "object");
            // console.log(keysToUpdate);
            // console.log(values);
            const clauses = keysToUpdate.map((k, index) => `${k} = $${index + 2}`).join(", ");
            await client.query(`
				UPDATE games SET ${clauses}
				WHERE game_number = $1
				`, [gameNumber, ...values]);
            await client.query("COMMIT");
        }
        catch (e) {
            await client.query("ROLLBACK");
            console.log(e);
        }
        finally {
            client.release();
        }
    }
    async registerRef(userId) {
        const client = await pool.connect();
        await client.query("BEGIN");
        const currentSsn = await this.getCurrentSeason();
        try {
            await client.query(`INSERT INTO ref_stats (user_id, season_id)
				VALUES ($1, $2)
					`, [userId, currentSsn.season_id]);
            await client.query("COMMIT");
        }
        catch (e) {
            console.trace(e);
            await client.query("ROLLBACK");
        }
        finally {
            client.release();
        }
    }
    async updateUsername(userid, username) {
        const client = await this.pool.connect();
        await client.query("BEGIN");
        try {
            await client.query(`UPDATE users SET username = $1 WHERE user_id = $2`, [
                username,
                userid,
            ]);
            await client.query("COMMIT");
        }
        catch (e) {
            console.trace(e);
            await client.query("ROLLBACK");
        }
        finally {
            client.release();
        }
    }
    async scoreGame(winner, gameNumber, staffId) {
        const client = await this.pool.connect();
        await client.query("BEGIN");
        let status = "Called";
        try {
            client.query(`UPDATE games SET winner = $1, by_user = $2, status = $3
				WHERE game_number = $4`, [winner, staffId, status, gameNumber]);
            await client.query("COMMIT");
        }
        catch (e) {
            console.trace(e);
            await client.query("ROLLBACK");
        }
        finally {
            client.release();
        }
    }
    async voidGame(gameNumber, staffId) {
        const client = await this.pool.connect();
        await client.query("BEGIN");
        try {
            await client.query("UPDATE games SET status = $1, by_user = $2 WHERE game_number = $3", ["Voided", staffId, gameNumber]);
            await client.query("COMMIT");
            return true;
        }
        catch (e) {
            console.trace(e);
            await client.query("ROLLBACK");
            if (e instanceof Error)
                throw new Error(e.message);
        }
        finally {
            client.release();
        }
    }
    async undoGame(gameNumber, newStatus, staffId) {
        const client = await this.pool.connect();
        await client.query("begin");
        try {
            await client.query("UPDATE games SET status = $1, winner = null, by_user = $2 WHERE game_number = $3", [newStatus, staffId, gameNumber]);
        }
        catch (e) {
            console.trace(e);
            await client.query("rollback");
        }
        finally {
            client.release();
        }
    }
    async subPlayer(oldId, newId, gameNumber, replaceCaptain) {
        const client = await this.pool.connect();
        await client.query("begin");
        try {
            if (replaceCaptain) {
                await client.query(`UPDATE games SET captain1 = CASE
						WHEN captain1 = $1 THEN $2
						ELSE captain1
						END,
					captain2 = CASE
						WHEN captain2 = $1 THEN $2
						ELSE captain2
						END
					WHERE game_number = $3`, [oldId, newId, gameNumber]);
            }
            else {
                await client.query("UPDATE game_players SET user_id = $1 WHERE user_id = $2 AND game_id = $3", [newId, oldId, gameNumber]);
            }
            await client.query("COMMIT");
        }
        catch (e) {
            console.trace(e);
            await client.query("rollback");
        }
        finally {
            client.release();
        }
    }
    async banUser(userId, reason, unbanTime, staffId) {
        const client = await pool.connect();
        await client.query("BEGIN");
        try {
            await client.query(`INSERT INTO queue_bans (user_id, total_bans, unban_time, reason, by_user)
				VALUES ($1, 1, $2, $3, $4)
				ON CONFLICT (user_id) DO
				UPDATE SET total_bans = EXCLUDED.total_bans + 1,
				unban_time = EXCLUDED.unban_time, reason = EXCLUDED.reason,
				by_user = EXCLUDED.by_user
				`, [userId, unbanTime, reason, staffId]);
            await client.query("COMMIT");
        }
        catch (e) {
            console.trace(`[DATABASE] ${e}`);
            client.query("ROLLBACK");
        }
        finally {
            client.release();
        }
    }
    async unbanUser(userId) {
        const client = await pool.connect();
        await client.query("BEGIN");
        try {
            await client.query(`UPDATE queue_bans SET unban_time = NULL,
				reason = NULL, by_user = NULL WHERE user_id = $1
				`, [userId]);
            await client.query("COMMIT");
        }
        catch (e) {
            console.trace(`[DATABASE] ${e}`);
            client.query("ROLLBACK");
        }
        finally {
            client.release();
        }
    }
    async getActiveBans() {
        const data = await this.getData("SELECT * FROM queue_bans WHERE unban_time IS NOT NULL");
        return data;
    }
    async checkPendingGames(howFar) {
        const data = await this.getData(`
			SELECT game_number AS name, status AS value
			FROM (
				SELECT game_number, status
				FROM games
				ORDER BY game_number DESC
				LIMIT $1
			) recent_games
			 WHERE status IN ('Not Called', 'Picking')
			 ORDER BY game_number DESC
			`, [howFar]);
        return data;
    }
    async endSeason(seasonId) {
        const client = await this.pool.connect();
        await client.query("BEGIN");
        try {
            await client.query(`
				INSERT INTO ref_stats (user_id, season_id, calls, voids)
				SELECT 
					g.by_user as user_id,
					s.season_id,
					SUM(CASE WHEN g.status = 'Called' THEN 1 ELSE 0 END) AS calls,
					SUM(CASE WHEN g.status = 'Voided' THEN 1 ELSE 0 END) AS voids
				FROM games g
				JOIN seasons s ON s.current_ssn = true
				WHERE g.by_user IS NOT NULL
				GROUP BY g.by_user, s.season_id;
				`);
            await pool.query(`TRUNCATE TABLE games CASCADE`);
            await pool.query(`TRUNCATE TABLE queue_bans CASCADE`);
            await pool.query(`TRUNCATE TABLE chat_logs CASCADE`);
            await pool.query(`TRUNCATE TABLE weekly_stats CASCADE`);
            await client.query("UPDATE seasons SET end_date = $1, current_ssn = false WHERE season_id = $2", [new Date(), seasonId]);
            await client.query("COMMIT");
        }
        catch (e) {
            console.trace(e);
            await client.query("ROLLBACK");
        }
        finally {
            client.release();
        }
    }
    async startSeason() {
        const client = await this.pool.connect();
        await client.query("BEGIN");
        const season = (await this.getData("select season_id from seasons order by season_id desc limit 1"))[0];
        const users = await this.getAllUsers(season.season_id);
        const clauses = users
            .map((user) => `(${user.user_id}, ${season.season_id + 1}, ${RANK_ROLE_IDS["Unranked"]}, 0.00)`)
            .join(", ");
        // console.log(clauses);
        try {
            await client.query(`INSERT INTO seasons (season_id, start_date, current_ssn)
				VALUES ($1, $2, true)
				`, [season.season_id + 1, new Date()]);
            await client.query(`INSERT INTO user_stats (user_id, season_id, rank_id, wlr) VALUES ${clauses}`);
            await client.query("COMMIT");
            return season.season_id + 1;
        }
        catch (e) {
            console.trace(e);
            await client.query("ROLLBACK");
            throw new Error("Something went wrong");
        }
        finally {
            client.release();
        }
    }
    async insertKOTC(details, table) {
        const client = await this.pool.connect();
        await client.query("BEGIN");
        let returning = "";
        if (table === "league_kotc") {
            returning = "RETURNING game_number";
        }
        const keys = Object.keys(details);
        const values = Object.keys(details)
            .map((k, index) => `$${index + 1}`)
            .join(", ");
        const onConflict = keys.map((key) => `${key} = EXCLUDED.${key}`).join(", ");
        try {
            const res = await client.query(`
					INSERT INTO ${table} (${keys.join(", ")})
					VALUES (${values})
					ON CONFLICT (game_number) DO UPDATE SET
					${onConflict}
					${returning}

				`, [...Object.values(details)]);
            await client.query("COMMIT");
            if (table === "league_kotc")
                return res.rows[0].game_number;
        }
        catch (e) {
            await client.query("ROLLBACK");
            console.log(e);
        }
        finally {
            client.release();
        }
    }
    async insertKOTCStats(details, table) {
        4;
        const client = await this.pool.connect();
        await client.query("BEGIN");
        const keys = Object.keys(details);
        const values = keys.map((k, index) => `$${index + 1}`).join(", ");
        try {
            await client.query(`
					INSERT INTO ${table} (${keys.join(", ")})
					VALUES (${values})
				`, [...Object.values(details)]);
            await client.query("COMMIT");
        }
        catch (e) {
            await client.query("ROLLBACK");
            console.log(e);
        }
        finally {
            client.release();
        }
    }
    async getKOTCMap(gameNumber, table) {
        return this.getData(`SELECT * FROM ${table} WHERE game_number = $1`, [gameNumber]);
    }
    async getKOTCStats(gameNumber, table) {
        return this.getData(`SELECT * FROM ${table} WHERE game_number = $1 ORDER BY kills DESC`, [gameNumber]);
    }
    // QUERIES
    async performQuery(client, query, args) {
        return client.query(query, args);
    }
}
const Database = new DatabaseClass(pool);
export default Database;