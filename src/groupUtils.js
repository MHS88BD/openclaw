/**
 * Group Utilities for OpenClaw WhatsApp Bot
 * Extracting and formatting group membership data.
 */

async function getGroupMembers(sock, groupJid) {
    try {
        if (!groupJid || !groupJid.endsWith('@g.us')) {
            return { success: false, error: "Invalid group ID. Must end with @g.us" };
        }

        console.log(`[GroupUtils] Fetching metadata for ${groupJid}`);
        const metadata = await sock.groupMetadata(groupJid);
        const participants = metadata.participants || [];
        
        // Filter for real phone numbers (@s.whatsapp.net) and skip LIDs (@lid)
        const cleanedNumbers = participants
            .filter(p => p.id && p.id.endsWith('@s.whatsapp.net'))
            .map(p => p.id.split('@')[0].split(':')[0]);

        const total = cleanedNumbers.length;
        const actualTotal = participants.length;
        const lidCount = actualTotal - total;
        const limit = 5000;
        const display = cleanedNumbers.slice(0, limit);

        let output = `📋 *Group Members* (Found: ${total} Numbers)\n`;
        output += `📍 *Group:* ${metadata.subject}\n`;
        if (lidCount > 0) {
            output += `🔐 *Hidden:* ${lidCount} IDs (Privacy Protected)\n`;
        }
        output += `\n`;
        
        display.forEach((num) => {
            const isNumeric = /^\d+$/.test(num);
            const cleanNum = isNumeric ? `+${num}` : `ID: ${num}`;
            output += `${cleanNum}\n`;
        });

        if (total > limit) {
            output += `\n⚠️ _Showing first ${limit} members_`;
        }

        return {
            success: true,
            text: output,
            count: total,
            subject: metadata.subject
        };
    } catch (err) {
        console.error(`[GroupUtils] Error:`, err.message);
        return {
            success: false,
            error: err.message === 'not-authorized' ? "Not authorized (Bot might not be in the group)" : "Unable to fetch members"
        };
    }
}

async function broadcastToGroup(sock, groupJid, template, start = 0, count = 10, replyFn) {
    try {
        const metadata = await sock.groupMetadata(groupJid);
        const participants = metadata.participants || [];
        const targetParticipants = participants.slice(start, start + count);

        await replyFn(`🚀 Starting broadcast to ${targetParticipants.length} members from "${metadata.subject}"... (Delay: 10-25s per msg)`);

        let sentCount = 0;
        for (const p of targetParticipants) {
            try {
                // Get name if available in store/metadata, otherwise generic
                let name = "there"; 
                // Note: Real name extraction without a persistent store is tricky, 
                // but we can try to use info if available. Defaulting for safety.
                
                const personalizedMsg = template.replace(/{name}/g, name);
                
                // Add a small zero-width random string at the end to make text unique
                const antiSpamToken = `\u200B` + Math.random().toString(36).substring(7);
                const finalMsg = personalizedMsg + " " + antiSpamToken;

                await sock.sendMessage(p.id, { text: finalMsg });
                sentCount++;

                // Anti-Ban Delay: 10-25 seconds random
                const delay = Math.floor(Math.random() * (25000 - 10000 + 1) + 10000);
                if (sentCount < targetParticipants.length) {
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            } catch (e) {
                console.error(`Failed to send to ${p.id}:`, e.message);
            }
        }

        await replyFn(`✅ Broadcast finished. Sent to ${sentCount}/${targetParticipants.length} people. Next start index should be: ${start + count}`);
        return { success: true, sent: sentCount };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

module.exports = { getGroupMembers, broadcastToGroup };
