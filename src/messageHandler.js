const { processCommand } = require('./aiEngine');
const userManager = require('./userManager');
const scheduler = require('./scheduler');
const { broadcastMessage } = require('./broadcast');
require('dotenv').config();

const OWNER_ID_WA = process.env.OWNER_NUMBER || "";
const OWNER_ID_TG = process.env.OWNER_TELEGRAM_ID || "";

async function processMessage(text, sender, platform, replyFn, sock = null) {
    if (!text) return;

    const ownerPhone = process.env.OWNER_NUMBER;
    const ownerLid = '107168208580730@lid';
    
    let isOwner = false;
    if (platform === 'whatsapp') {
        isOwner = (sender === ownerPhone || sender === ownerLid);
    } else {
        isOwner = (String(sender) === String(process.env.OWNER_TELEGRAM_ID));
    }
    
    let lowerBody = text.toLowerCase();
    
    // Command Handling
    let isAiCommand = lowerBody.startsWith('ai ') || lowerBody === 'ai';

    // WhatsApp requires 'ai' prefix ONLY IF it's not a direct private message to itself.
    // If sender is owner, it's a "Message Yourself" private chat, so we can allow natural chatting.
    if (platform === 'whatsapp' && !isOwner && !isAiCommand) {
        return;
    }

    let queryText = text;
    if (isAiCommand) {
        queryText = text.slice(lowerBody === 'ai' ? 2 : 3).trim();
    }
    if (!queryText) queryText = 'hello'; // Default if only "ai" was sent

    let cmdBody = queryText.toLowerCase();

    // Public Identification Command
    if (cmdBody === 'id') {
        return await replyFn(`🆔 Your ID on ${platform.toUpperCase()}: \`${sender}\``);
    }

    // STRICT OWNER CONTROL
    if (!isOwner) {
        console.log(`[Security] Ignoring command from non-owner: ${sender}`);
        return;
    }

    const user = userManager.resolveUser(platform, sender);
    const userId = user ? user.user_id : sender;

    logAction(platform, userId, sender, text, "processing");

    try {
        // --- Scheduler Command (Fallback/Explicit) ---
        if (cmdBody.startsWith('schedule ')) {
            const parts = queryText.split(' ');
            // schedule 2026-04-10 10:00 Hello
            if (parts.length >= 4) {
                const timeStr = parts[1] + ' ' + parts[2];
                const message = parts.slice(3).join(' ');
                
                try {
                    const job = scheduler.schedule(sender, timeStr, message, platform);
                    await replyFn(`✅ Scheduled for ${formatBST(job.time)}\nTarget: ${sender}`);
                    logAction(platform, userId, sender, text, "success");
                } catch (err) {
                    await replyFn(`❌ Scheduling failed: ${err.message}`);
                }
                return;
            }
        }

        // --- Broadcast Command ---
        if (cmdBody.startsWith('broadcast ')) {
            const message = queryText.slice(10).trim();
            await replyFn(`🚀 Starting broadcast to groups and contacts...`);
            
            try {
                const result = await broadcastMessage(sock, message, sender);
                await replyFn(`✅ Broadcast Finished!\n- Groups: ${result.groups}\n- Contacts: ${result.contacts}\n- Fails: ${result.failed}`);
                logAction(platform, userId, sender, text, "success");
            } catch (err) {
                await replyFn(`❌ Broadcast failed: ${err.message}`);
            }
            return;
        }

        // --- Sequential Send Command ---
        if (cmdBody.startsWith('send group ')) {
            const MAX_LIMIT = 50;
            const parts = queryText.split(' ');
            const count = parseInt(parts[2]);
            const message = parts.slice(3).join(' ');

            if (isNaN(count) || count <= 0 || !message) {
                return await replyFn("⚠️ Usage: ai send group <count> <message>");
            }

            if (count > MAX_LIMIT) {
                return await replyFn(`❌ Safety Limit: Maximum ${MAX_LIMIT} messages allowed per loop.`);
            }

            // Validate Target JID (Allow Groups and Personal Chats)
            const isValidJid = sender.endsWith('@g.us') || sender.endsWith('@s.whatsapp.net');
            if (!isValidJid) return await replyFn("⚠️ Invalid Chat JID.");

            await replyFn(`🚀 Sending ${count} messages sequentially...`);
            for (let i = 1; i <= count; i++) {
                try {
                    await sock.sendMessage(sender, { text: `${message} (${i}/${count})` });
                    // Random delay between 2s-4s to prevent spam detection
                    await new Promise(r => setTimeout(r, 2000 + Math.random() * 2000));
                } catch (e) {
                    console.error(`[Repeater] Failed at ${i}/${count}:`, e.message);
                    break;
                }
            }
            await replyFn("✅ Finished sequential send.");
            logAction(platform, userId, sender, text, "success");
            return;
        }

        // --- Standard Commands ---
        if (cmdBody === 'whoami') {
            const connectedPlatforms = [];
            if (user.telegram_id) connectedPlatforms.push('Telegram');
            if (user.whatsapp_id) connectedPlatforms.push('WhatsApp');
            
            const whoamiMsg = `👤 *Your Identity*\n- internal_id: \`${user.user_id}\`\n- Platforms: ${connectedPlatforms.join(', ')}`;
            await replyFn(whoamiMsg);
            logAction(platform, userId, sender, text, "success");
            return;
        }

        // Pass AI query to engine
        const reply = await processCommand(queryText, platform);

        if (reply && reply.startsWith("INTERNAL_SCHEDULE:")) {
            const argStr = reply.replace("INTERNAL_SCHEDULE:", "");
            const args = JSON.parse(argStr);
            try {
                const job = scheduler.schedule(sender, args.target_time, args.message, platform);
                await replyFn(`✅ Scheduled reminder for ${formatBST(job.time)}`);
                logAction(platform, userId, sender, text, "success");
            } catch (err) {
                await replyFn(`❌ I couldn't schedule the reminder: ${err.message}`);
                logAction(platform, userId, sender, text, "error", err.message);
            }
        } else {
            await replyFn(reply);
            logAction(platform, userId, sender, text, "success");
        }

    } catch (err) {
        logAction(platform, userId, sender, text, "error", err.message);
        await replyFn("⚠️ System Error: " + err.message);
    }
}

function logAction(platform, user_id, platform_id, message, status, error = null) {
    console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        platform,
        user_id,
        platform_id,
        message,
        status,
        error
    }));
}

function formatBST(timestamp) {
    const d = new Date(timestamp);
    // Add 6 hours to UTC to get BST
    const bst = new Date(d.getTime() + (6 * 60 * 60 * 1000));
    return bst.toISOString().replace('T', ' ').substring(0, 16) + " BST";
}

module.exports = { processMessage };
