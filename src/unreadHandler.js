const { store } = require('../whatsapp');

class UnreadManager {
    constructor() {
        this.indexCache = new Map(); // Store Index -> { jid, message }
    }

    async getUnreadList() {
        this.indexCache.clear();
        
        // Filter chats with unreadCount > 0
        const chats = store.chats.all().filter(chat => chat.unreadCount > 0);
        
        if (chats.length === 0) return "✅ No unread messages found!";

        let list = "📂 *Unread Messages:*\n\n";
        
        for (let i = 0; i < chats.length; i++) {
            const chat = chats[i];
            const messages = store.messages[chat.id]?.array || [];
            // Get the last N unread messages
            const unreadMsgs = messages.slice(-chat.unreadCount);
            
            const chatName = chat.name || chat.id.split('@')[0];
            const displayMsgs = unreadMsgs.map(m => {
                const text = m.message?.conversation || m.message?.extendedTextMessage?.text || "[Media/Other]";
                const pushName = m.pushName || "User";
                return `   - ${pushName}: ${text}`;
            }).join('\n');

            const index = i + 1;
            this.indexCache.set(index.toString(), chat.id);
            
            list += `*${index}. ${chatName}* (${chat.unreadCount} unread)\n${displayMsgs}\n\n`;
        }

        list += "_Reply using: 'Reply to 1: your message'_";
        return list;
    }

    getJidByIndex(index) {
        return this.indexCache.get(index.toString());
    }
}

module.exports = new UnreadManager();
