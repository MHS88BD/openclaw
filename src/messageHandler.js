const fs = require('fs');
const path = require('path');
const { processCommand } = require('./aiEngine');
const userManager = require('./userManager');
const scheduler = require('./scheduler');
const autoReplyManager = require('./autoReplyManager');
const budgetApi = require('./budgetApi');
const accountMemory = require('./accountMemory');
const merchantMemory = require('./merchantMemory');
require('dotenv').config();

const OWNER_ID_TG = process.env.OWNER_TELEGRAM_ID || "";
const PENDING_EXPENSES = {};
const PROCESSED_SMS = new Map();

async function processMessage(text, sender, platform, replyFn, sock = null, author = null) {
    if (!text) return;
    
    console.log(`📩 [${platform.toUpperCase()}] New Message from ${sender}: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);

    // 1. Duplicate Prevention (Short window: 2s)
    const now = Date.now();
    if (PROCESSED_SMS.has(text)) {
        if (now - PROCESSED_SMS.get(text) < 2000) return;
    }
    PROCESSED_SMS.set(text, now);

    const ownerPhone = (process.env.OWNER_NUMBER || "").trim();
    const ownerJid = ownerPhone.includes('@') ? ownerPhone : `${ownerPhone}@s.whatsapp.net`;
    
    // Normalize Identity
    const checkId = (platform === 'whatsapp' && author) ? author : sender;
    const normalizedSender = checkId.split(':')[0].split('@')[0];
    const normalizedOwner = ownerPhone.split('@')[0];

    const isAutoReply = autoReplyManager.isAutoReplyEnabled(sender);
    
    // Robust Owner Check
    let isOwner = false;
    if (platform === 'whatsapp') {
        const ownerLid = (process.env.OWNER_LID || "").split('@')[0];
        isOwner = (normalizedSender === normalizedOwner || normalizedSender === ownerLid);
    } else {
        // Telegram: Match by Username OR numerical ID
        const tgOwner = String(process.env.OWNER_TELEGRAM_ID || "").toLowerCase();
        const currentSender = String(sender).toLowerCase();
        isOwner = (currentSender === tgOwner);
    }
    
    console.log(`👤 Identity: ${sender} | platform: ${platform} | isOwner: ${isOwner} | isAutoReply: ${isAutoReply}`);

    const isWebhook = (sender === 'n8n_webhook' || platform === 'sms');
    
    // If NOT owner and NOT AI command and NOT auto-reply and NOT webhook, IGNORE
    if (!isOwner && !text.toLowerCase().startsWith('ai') && !isAutoReply && !isWebhook) {
        console.log(`🚫 Ignoring message from ${sender} (Not owner/AI/Auto/Webhook)`);
        return;
    }
    
    let lowerBody = text.toLowerCase().trim();
    const userId = sender.split(':')[0].split('@')[0];

    // --- Training Command Handler ---
    if (lowerBody.startsWith('ai account rule ') && isOwner) {
        const match = text.match(/ai account rule "([^"]+)"\s*=\s*"([^"]+)"/i);
        if (match) {
            const keyword = match[1];
            const accountId = match[2];
            accountMemory.setMapping(keyword, accountId);
            return await replyFn(`✅ *Account Rule Saved!*\nKeyword: \`${keyword}\` maps to Account ID: \`${accountId}\``);
        }
    }

    if (lowerBody.startsWith('ai merchant rule ') && isOwner) {
        const match = text.match(/ai merchant rule "([^"]+)"\s*=\s*"([^"]+)"/i);
        if (match) {
            const merchant = match[1];
            const categoryId = match[2];
            merchantMemory.setMapping(merchant, categoryId);
            return await replyFn(`✅ *Merchant Rule Saved!*\nMerchant: \`${merchant}\` maps to Category ID: \`${categoryId}\``);
        }
    }

    if (lowerBody === 'ai list budget' && isOwner) {
        try {
            const accounts = await budgetApi.getAccounts();
            const categories = await budgetApi.getCategories();
            
            let msg = "🏦 *Accounts:*\n";
            accounts.forEach(a => msg += `• ${a.name}: \`${a.id}\`\n`);
            
            msg += "\n📁 *Top Categories:*\n";
            categories.slice(0, 15).forEach(c => msg += `• ${c.name}: \`${c.id}\`\n`);
            
            return await replyFn(msg);
        } catch (e) {
            return await replyFn(`❌ Error fetching list: ${e.message}`);
        }
    }

    // --- Interactive Expense Flow Handler ---
    if (PENDING_EXPENSES[userId] && isOwner) {
        const state = PENDING_EXPENSES[userId].state;

        if (state === 'awaiting_category') {
            const categoryId = text.trim();
            PENDING_EXPENSES[userId].categoryId = categoryId;
            PENDING_EXPENSES[userId].state = 'awaiting_account';
            if (PENDING_EXPENSES[userId].merchant) merchantMemory.setMapping(PENDING_EXPENSES[userId].merchant, categoryId);
            return await replyFn(`🏦 *Account কোনটা?* (বাজেট-বেকারস Account ID দিন)`);
        }

        if (state === 'awaiting_account') {
            const accountId = text.trim();
            PENDING_EXPENSES[userId].accountId = accountId;
            PENDING_EXPENSES[userId].state = 'awaiting_confirm';
            const exp = PENDING_EXPENSES[userId];
            const preview = `📊 *Expense Preview*\n💰 *Amount:* ${exp.amount} BDT\n🏷️ *Merchant:* ${exp.merchant || 'N/A'}\n📁 *Category ID:* ${exp.categoryId}\n🏦 *Account ID:* ${exp.accountId}\n\n*Confirm* অথবা *Cancel* লিখুন।`;
            return await replyFn(preview);
        }

        if (state === 'awaiting_confirm') {
            if (lowerBody === 'confirm' || lowerBody === 'yes' || lowerBody === 'হ্যাঁ' || lowerBody === 'ok' || lowerBody.includes('confirm')) {
                const expData = PENDING_EXPENSES[userId];
                delete PENDING_EXPENSES[userId];
                await replyFn("⏳ *বাজেট-বেকারসে এন্ট্রি করা হচ্ছে...*");
                try {
                    await budgetApi.createRecord({ amount: expData.amount, categoryId: expData.categoryId, accountId: expData.accountId, note: expData.fullSms });
                    return await replyFn(`✅ *Entry Completed!*`);
                } catch (err) { return await replyFn(`❌ *Entry Failed:*\n${err.message}`); }
            } else if (lowerBody === 'cancel' || lowerBody === 'no') {
                delete PENDING_EXPENSES[userId];
                return await replyFn("🚫 Entry বাতিল করা হয়েছে।");
            }
        }
    }

    // --- CORE COMMAND DETECTION ---
    let isAiCommand = lowerBody.startsWith('ai ') || lowerBody === 'ai';
    let queryText = text;
    if (isAiCommand) queryText = text.slice(lowerBody === 'ai' ? 2 : 3).trim();
    if (!queryText) queryText = 'hello';

    try {
        const reply = await processCommand(queryText, platform);

        if (reply && reply.startsWith("INTERNAL_FINANCE:")) {
            const data = JSON.parse(reply.replace("INTERNAL_FINANCE:", ""));
            let autoAccountId = accountMemory.getAccountId(text);
            let autoCategoryId = merchantMemory.getCategoryId(data.merchant);

            if (autoAccountId && autoCategoryId) {
                console.log(`🤖 Auto-confirming expense: ${data.amount} BDT for ${data.merchant}`);
                try {
                    await budgetApi.createRecord({ 
                        amount: data.amount, 
                        categoryId: autoCategoryId, 
                        accountId: autoAccountId, 
                        note: text 
                    });
                    await replyFn(`✅ *Auto-Entry Completed!*\n💰 *Amount:* ${data.amount} BDT\n🏷️ *Merchant:* ${data.merchant}`);
                    return { status: "success", message: "entry created", entryCreated: true };
                } catch (err) {
                    await replyFn(`❌ *Auto-Entry Failed:* ${err.message}`);
                    return { status: "error", message: err.message };
                }
            } else {
                PENDING_EXPENSES[userId] = { state: autoCategoryId ? 'awaiting_account' : 'awaiting_category', amount: data.amount, merchant: data.merchant, categoryId: autoCategoryId, accountId: autoAccountId, fullSms: text };
                await replyFn(!autoCategoryId ? `💰 *Expense Detected:* ${data.amount} BDT\n📁 *Category ID কি হবে?*` : `💰 *Expense Detected:* ${data.amount} BDT\n🏦 *Account ID কি হবে?*`);
                return { status: "pending", message: "awaiting user input" };
            }
        } 
        // RESTORE SCHEDULING LOGIC
        else if (reply && reply.startsWith("INTERNAL_SCHEDULE:")) {
            const args = JSON.parse(reply.replace("INTERNAL_SCHEDULE:", ""));
            const targetPhone = args.target_phone || sender;
            const res = await scheduler.addJob(targetPhone, args.message, args.target_time, platform);
            return await replyFn(res);
        }
        // RESTORE WHATSAPP SEND LOGIC
        else if (reply && reply.startsWith("INTERNAL_WHATSAPP_SEND:")) {
            if (!sock) return await replyFn("⚠️ WhatsApp functionality is currently restricted.");
            const args = JSON.parse(reply.replace("INTERNAL_WHATSAPP_SEND:", ""));
            const jid = args.phone_number.includes('@') ? args.phone_number : `${args.phone_number}@s.whatsapp.net`;
            await sock.sendMessage(jid, { text: args.message });
            return await replyFn(`✅ Message sent to \`${jid}\``);
        }
        else {
            await replyFn(reply);
        }
    } catch (err) {
        await replyFn("⚠️ System Error: " + err.message);
    }
}

module.exports = { processMessage };
