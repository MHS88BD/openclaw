// Manual Unread Manager (No dependency on Baileys Store)
class UnreadManager {
    constructor() {
        this.chats = new Map(); // jid -> { name, unreadCount, lastMessages: [] }
        this.indexCache = new Map(); // index -> jid
    }

    // Update chat info from Baileys events
    updateChat(chat) {
        if (!chat.id) return;
        const existing = this.chats.get(chat.id) || { name: chat.id, unreadCount: 0, lastMessages: [] };
        
        if (chat.name) existing.name = chat.name;
        if (typeof chat.unreadCount !== 'undefined') {
            // If unreadCount is -1, it usually means it's been read
            existing.unreadCount = chat.unreadCount < 0 ? 0 : chat.unreadCount;
        }
        
        this.chats.set(chat.id, existing);
    }

    // Add message to chat history and increment unread if not from me
    addMessage(msg, isFromMe) {
        const jid = msg.key.remoteJid;
        if (!jid) return;

        const chat = this.chats.get(jid) || { name: jid, unreadCount: 0, lastMessages: [] };
        
        const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || "[Media]";
        const pushName = msg.pushName || "User";

        chat.lastMessages.push({ pushName, text });
        if (chat.lastMessages.length > 10) chat.lastMessages.shift();

        if (!isFromMe) {
            // If we don't have a reliable unreadCount from Baileys yet, we increment manually
            // But usually Baileys sends chat.update with unreadCount
        }

        this.chats.set(jid, chat);
    }

    async getUnreadList() {
        this.indexCache.clear();
        const unreadChats = Array.from(this.chats.values())
            .filter(c => c.unreadCount > 0)
            .map((c, i) => ({ ...c, jid: Array.from(this.chats.keys())[Array.from(this.chats.values()).indexOf(c)] }));

        if (unreadChats.length === 0) return "✅ No unread messages found in current session cache!";

        let list = "📂 *Unread Messages:*\n\n";
        for (let i = 0; i < unreadChats.length; i++) {
            const chat = unreadChats[i];
            const index = i + 1;
            this.indexCache.set(index.toString(), chat.jid);
            
            const displayMsgs = chat.lastMessages.slice(-chat.unreadCount).map(m => `   - ${m.pushName}: ${m.text}`).join('\n');
            list += `*${index}. ${chat.name || chat.jid}* (${chat.unreadCount} unread)\n${displayMsgs || "   (Messages loading...)"}\n\n`;
        }

        list += "_Reply using: 'Reply to 1: your message'_";
        return list;
    }

    getJidByIndex(index) {
        return this.indexCache.get(index.toString());
    }
}

module.exports = new UnreadManager();
