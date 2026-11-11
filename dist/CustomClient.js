import { Client, Collection } from "discord.js";
import path from "node:path";
export class CustomClient extends Client {
    slashCommands;
    prefixCommands;
    constructor(options) {
        super(options);
        this.slashCommands = new Collection();
        this.prefixCommands = new Collection();
    }
}
/**
 * you start from src-dist folder
 */
export const rootPath = path.join(import.meta.dirname);
