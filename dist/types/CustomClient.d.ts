import { Client, Collection, type ClientOptions } from "discord.js";
import type { prefixCommand, slashCommand } from "./types/commands.js";
export declare class CustomClient extends Client {
    slashCommands: Collection<string, slashCommand>;
    prefixCommands: Collection<string, prefixCommand>;
    constructor(options: ClientOptions);
}
