class ChannelRegistry {
    channels;
    constructor() {
        this.channels = new Map();
    }
    register(channel) {
        this.channels.set(channel.id, channel);
    }
    isRegistered(channelId) {
        return this.channels.has(channelId);
    }
    getChannel(channelId) {
        return this.channels.get(channelId);
    }
}
const channelRegistry = new ChannelRegistry();
export default channelRegistry;
