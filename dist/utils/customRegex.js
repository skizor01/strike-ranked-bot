export class CustomRegex {
    static getUserIds(str, grabFirst) {
        const regex = /<@!?(\d+)>/g;
        let stringToMatch = Array.isArray(str) ? str.join(" ") : str;
        const ids = [...stringToMatch.matchAll(regex)].map((m) => m[1]);
        const matches = grabFirst ? ids.slice(0, 1) : ids;
        return matches;
    }
    static changeElo(str) {
        const userId = CustomRegex.getUserIds(str, true)[0];
        const regex = /(?<!<@!)(\b\d+\b)(?!>)/;
        const elo = str.match(regex)?.[0];
        // console.log(matches?.[0]!, userIds[0])
        return [elo, userId];
    }
    static getGameNumberHash(text) {
        const match = /#(\d+)/.exec(text);
        return parseInt(match[1]);
    }
    static getQueueType(text) {
        const match = /- (.*)/.exec(text);
        return match[1];
    }
}
