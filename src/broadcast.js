const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function broadcastMessage(sock, message, ownerJid) {
    let results = {
        groups: 0,
        contacts: 0,
        failed: 0
    };

    try {
        // 1. Get all groups
        const groups = await sock.groupFetchAllParticipating();
        const groupJids = Object.keys(groups);

        console.log(`[Broadcast] Starting broadcast to ${groupJids.length} groups`);

        for (const jid of groupJids) {
            try {
                await sock.sendMessage(jid, { text: message });
                results.groups++;
                // Rate limiting: 2-5 seconds between group messages
                await delay(2000 + Math.random() * 3000);
            } catch (e) {
                console.error(`[Broadcast] Failed for group ${jid}:`, e.message);
                results.failed++;
            }
        }

        // 2. Get Contacts (from userMap.json if available)
        const userManager = require('./userManager');
        const contactJids = userManager.users
            .map(u => u.whatsapp_id)
            .filter(id => id && id.endsWith('@s.whatsapp.net') && id !== ownerJid);

        console.log(`[Broadcast] Starting broadcast to ${contactJids.length} contacts`);

        for (const jid of contactJids) {
            try {
                await sock.sendMessage(jid, { text: message });
                results.contacts++;
                // Rate limiting: 3-7 seconds between contact messages
                await delay(3000 + Math.random() * 4000);
            } catch (e) {
                console.error(`[Broadcast] Failed for contact ${jid}:`, e.message);
                results.failed++;
            }
        }

        return results;
    } catch (error) {
        console.error("[Broadcast] Critical Error:", error);
        throw error;
    }
}

module.exports = { broadcastMessage };
