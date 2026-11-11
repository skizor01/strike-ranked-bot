import { PermissionFlagsBits } from "discord.js";
import { commandChannels, SPECIAL_ROLES, StaffRoles } from "../config/index.js";
export default async function hasRequiredRoles(member, command) {
    if (!command.requiredRoles?.length)
        return true;
    const roleIds = command.requiredRoles.map((name) => StaffRoles[name]);
    const hasRequiredRole = roleIds.some((id) => member.roles.cache.has(id));
    return hasRequiredRole;
}
export function canUseCommand(message, command) {
    const channel = message.channel;
    const member = message.member;
    const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
    if (isAdmin)
        return { allowed: true };
    if (command.restrictedRoles?.length) {
        const roleIds = command.restrictedRoles.map(name => SPECIAL_ROLES[name]);
        const hasRequiredRole = roleIds.some((id) => member.roles.cache.has(id));
        if (hasRequiredRole)
            return { allowed: false, reason: "You cannot run this command" };
    }
    if (command.requiredRoles?.length) {
        const roleIds = command.requiredRoles.map((name) => StaffRoles[name]);
        const hasRequiredRole = roleIds.every((id) => member.roles.cache.has(id));
        if (!hasRequiredRole)
            return { allowed: false, reason: "You do not have the role to run this command" };
    }
    if (command.allowedChannels?.length) {
        const allowedChannels = command.allowedChannels.map(name => commandChannels[name]);
        const isStaff = Object.values(StaffRoles).some((id) => member.roles.cache.has(id));
        if (!allowedChannels.includes(channel.id) && !isStaff)
            return { allowed: false, reason: "You cannot run this command in this channel" };
    }
    return { allowed: true };
}
