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
        
        // Clean phone numbers by removing @s.whatsapp.net and potentially LIDs
        const cleanedNumbers = participants.map(p => {
            const id = p.id || "";
            return id.split('@')[0].split(':')[0];
        });

        const total = cleanedNumbers.length;
        const limit = 5000;
        const display = cleanedNumbers.slice(0, limit);

        let output = `📋 *Group Members* (Total: ${total})\n`;
        output += `📍 *Group:* ${metadata.subject}\n\n`;
        
        display.forEach((num) => {
            // Add + if it's a phone number (numeric)
            const cleanNum = /^\d+$/.test(num) ? `+${num}` : num;
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

module.exports = { getGroupMembers };
