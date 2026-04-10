const { processCommand } = require('./aiEngine');
const userManager = require('./userManager');
const scheduler = require('./scheduler');
const { broadcastMessage } = require('./broadcast');
const unreadHandler = require('./unreadHandler');
const { getGroupMembers } = require('./groupUtils');
require('dotenv').config();

const OWNER_ID_WA = process.env.OWNER_NUMBER || "";
const OWNER_ID_TG = process.env.OWNER_TELEGRAM_ID || "";

async function processMessage(text, sender, platform, replyFn, sock = null, author = null) {
    if (!text) return;

    const ownerPhone = (process.env.OWNER_NUMBER || "").trim();
    const ownerLid = '107168208580730@lid';
    
    // Normalize JIDs for comparison
    const checkId = (platform === 'whatsapp' && author) ? author : sender;
    const normalizedSender = checkId.split(':')[0].split('@')[0];
    const normalizedOwner = ownerPhone.split('@')[0];
    const normalizedOwnerLid = ownerLid.split('@')[0];

    let isOwner = false;
    if (platform === 'whatsapp') {
        isOwner = (normalizedSender === normalizedOwner || normalizedSender === normalizedOwnerLid);
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

    // List Groups Command (WhatsApp Only)
    if (cmdBody === 'groups' || cmdBody === 'list groups') {
        if (platform !== 'whatsapp' || !sock) {
            return await replyFn("⚠️ This command is only available on WhatsApp.");
        }
        try {
            const groups = await sock.groupFetchAllParticipating();
            const groupList = Object.values(groups).map(g => `- *${g.subject}*\n  ID: \`${g.id}\``).join('\n\n');
            await replyFn(`🏘️ *Your WhatsApp Groups:* \n\n${groupList || "No groups found."}`);
            return;
        } catch (err) {
            return await replyFn(`❌ Failed to fetch groups: ${err.message}`);
        }
    }

    // NEW: Group Members Extract Command (WhatsApp Only)
    const isMembersCmd = cmdBody.startsWith('members') || 
                         cmdBody === 'এই গ্রুপের সব নাম্বার দাও' || 
                         cmdBody.includes('members of this group');

    if (isMembersCmd && platform === 'whatsapp' && sock) {
        if (!isOwner) return; // Silent ignore for others

        let targetJid = "";
        
        // 1. Check if ID is provided: ai members 120363041234567@g.us
        const jidMatch = queryText.match(/[0-9a-zA-Z-]+@g\.us/);
        if (jidMatch) {
            targetJid = jidMatch[0];
        } 
        // 2. Check if "this group" or Bengali command in a group chat
        else if (sender.endsWith('@g.us')) {
            targetJid = sender;
        }

        if (!targetJid) {
            return await replyFn("❌ Please provide a Group ID or use this command inside a group.");
        }

        try {
            const result = await getGroupMembers(sock, targetJid);
            if (result.success) {
                await replyFn(result.text);
                logAction(platform, sender, sender, text, "group_members_extract", { group: targetJid, count: result.count });
            } else {
                await replyFn(`❌ ${result.error}`);
            }
            return;
        } catch (err) {
            return await replyFn(`❌ Unable to fetch members: ${err.message}`);
        }
    }

    // NEW: ID Lookup Command (WhatsApp Only)
    if (cmdBody.startsWith('lookup ') && platform === 'whatsapp' && sock) {
        if (!isOwner) return;
        const targetId = cmdBody.replace('lookup ', '').trim();
        try {
            const [result] = await sock.onWhatsApp(targetId);
            if (result && result.exists) {
                await replyFn(`✅ *Match Found!*\n\n- JID: \`${result.jid}\`\n- Exists: Yes\n\n_Note: If the JID starts with digits followed by @s.whatsapp.net, those digits are the phone number._`);
            } else {
                await replyFn(`❌ No WhatsApp account found for ID: \`${targetId}\``);
            }
            logAction(platform, sender, sender, text, "id_lookup", { targetId });
            return;
        } catch (err) {
            return await replyFn(`❌ Lookup failed: ${err.message}`);
        }
    }

    // Unread Messages Command (WhatsApp Only)
    if (cmdBody === 'unread' || cmdBody === 'list unread') {
        if (platform !== 'whatsapp') return await replyFn("⚠️ This is only available on WhatsApp.");
        const list = await unreadHandler.getUnreadList();
        return await replyFn(list);
    }

    // Reply to Unread by Index
    if (cmdBody.startsWith('reply to ')) {
        // format: reply to 1: hello
        const match = queryText.match(/reply to (\d+)[:\s]+(.*)/i);
        if (match) {
            const index = match[1];
            const message = match[2];
            const targetJid = unreadHandler.getJidByIndex(index);
            
            if (!targetJid) return await replyFn(`❌ Invalid index: ${index}. Use 'ai unread' to see valid numbers.`);
            
            try {
                await sock.sendMessage(targetJid, { text: message });
                return await replyFn(`✅ Replied to index ${index} (${targetJid})`);
            } catch (err) {
                return await replyFn(`❌ Failed to reply: ${err.message}`);
            }
        }
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
                let targetJid = sender;
                if (args.target_phone) {
                    let targetAddr = args.target_phone.trim();
                    if (targetAddr.endsWith('@g.us')) {
                        targetJid = targetAddr;
                    } else {
                        let phone = targetAddr.replace(/\D/g, '');
                        if (phone.length >= 10) {
                            targetJid = `${phone}@s.whatsapp.net`;
                        }
                    }
                }

                const job = scheduler.schedule(targetJid, args.target_time, args.message, platform);
                await replyFn(`✅ Scheduled reminder for ${formatBST(job.time)} to be sent to ${targetJid === sender ? 'you' : targetJid}`);
                logAction(platform, userId, sender, text, "success");
            } catch (err) {
                await replyFn(`❌ I couldn't schedule the reminder: ${err.message}`);
                logAction(platform, userId, sender, text, "error", err.message);
            }
        } else if (reply && reply.startsWith("INTERNAL_WHATSAPP_SEND:")) {
            const argStr = reply.replace("INTERNAL_WHATSAPP_SEND:", "");
            const args = JSON.parse(argStr);
            try {
                if (platform !== 'whatsapp' || !sock) {
                    throw new Error("Direct WhatsApp sending is only available through the WhatsApp bot.");
                }
                
                // Intelligent JID detection
                let targetAddr = args.phone_number.trim();
                let jid = "";
                
                if (targetAddr.endsWith('@g.us')) {
                    jid = targetAddr;
                } else {
                    let phone = targetAddr.replace(/\D/g, ''); 
                    if (phone.length < 10) throw new Error("Invalid phone number format.");
                    jid = `${phone}@s.whatsapp.net`;
                }
                
                await sock.sendMessage(jid, { text: args.message });
                await replyFn(`✅ Message sent to: ${jid}`);
                logAction(platform, userId, sender, text, "success");
            } catch (err) {
                await replyFn(`❌ Failed to send message: ${err.message}`);
                logAction(platform, userId, sender, text, "error", err.message);
            }
        } else if (reply === "INTERNAL_UNREAD_LIST") {
            const list = await unreadHandler.getUnreadList();
            await replyFn(list);
            logAction(platform, userId, sender, text, "success");
        } else if (reply && reply.startsWith("INTERNAL_UNREAD_REPLY:")) {
            const argStr = reply.replace("INTERNAL_UNREAD_REPLY:", "");
            const args = JSON.parse(argStr);
            try {
                const targetJid = unreadHandler.getJidByIndex(args.index);
                if (!targetJid) throw new Error(`Invalid index: ${args.index}`);
                
                await sock.sendMessage(targetJid, { text: args.message });
                await replyFn(`✅ Replied to index ${args.index}`);
                logAction(platform, userId, sender, text, "success");
            } catch (err) {
                await replyFn(`❌ Reply failed: ${err.message}`);
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
