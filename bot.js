const { Telegraf } = require('telegraf');
require('dotenv').config();
const { processMessage } = require('./src/messageHandler');
const { connectToWhatsApp } = require('./whatsapp');
const express = require('express');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

// 1. Initialize Telegram Bot
const telegramBot = new Telegraf(process.env.TELEGRAM_TOKEN);

telegramBot.start((ctx) => ctx.reply('Welcome to the Antigravity Command Center!'));

telegramBot.on('text', async (ctx) => {
    try {
        const text = ctx.message.text;
        const sender = ctx.message.from.username || String(ctx.message.from.id);
        
        const replyFn = async (replyText) => {
            await ctx.reply(replyText, { parse_mode: 'Markdown' }).catch(err => {
                // Fallback to plain text if Markdown fails
                return ctx.reply(replyText);
            });
        };

        await processMessage(text, sender, 'telegram', replyFn);
    } catch (err) {
        console.error("Telegram message error:", err);
    }
});

// Start Bots
async function startSystem() {
    console.log("Starting Multi-Channel AI System...");
    
    // Start WhatsApp
    try {
        await connectToWhatsApp();
    } catch (error) {
        console.error("Error starting WhatsApp bot. System will continue to run with Telegram only:", error);
    }

    // Start Telegram
    try {
        await telegramBot.launch();
        console.log('Telegram Bot is active!');
        const scheduler = require('./src/scheduler');
        scheduler.startWorker(null, telegramBot);
    } catch (error) {
        console.error("Error starting Telegram bot:", error);
    }

    // 3. Start Webhook Server (for n8n/SMS)
    const PORT = process.env.WH_PORT || 3000;
    app.post('/api/expense', async (req, res) => {
        const { message, source, sender } = req.body;
        if (!message) return res.status(400).send({ status: "error", message: "Message is required" });

        console.log(`[Webhook] Received from ${source || 'api'}: ${message}`);

        const { getSock } = require('./whatsapp');
        const ownerJid = (process.env.OWNER_NUMBER || "").trim();
        const sock = getSock();

        const replyFn = async (text) => {
            console.log(`[Webhook Reply] ${text}`);
            if (sock && ownerJid) {
                await sock.sendMessage(ownerJid, { text: '📧 [NOTIFICATION]\n' + text }).catch(e => {
                    console.error("Webhook WhatsApp Send Error:", e.message);
                });
            }
        };

        try {
            const result = await processMessage(message, sender || 'n8n_webhook', source || 'sms', replyFn, sock);
            
            if (result && result.status === 'success') {
                res.send({ status: "success", message: "entry created" });
            } else if (result && result.status === 'pending') {
                res.send({ status: "success", message: "processing - awaiting user confirmation" });
            } else {
                res.send({ status: "success", message: "message processed" });
            }
        } catch (err) {
            console.error("Webhook Processing Error:", err);
            res.status(500).send({ status: "error", message: err.message });
        }
    });

    try {
        const HOST = '0.0.0.0';
        app.listen(PORT, HOST, () => {
            console.log(`🚀 Webhook Server running on http://${HOST}:${PORT}`);
            console.log(`🔗 API Endpoint: http://${process.env.SSH_HOST || 'localhost'}:${PORT}/api/expense`);
        });
    } catch (err) {
        console.error("Failed to start Express server:", err.message);
    }
}

startSystem();

// Graceful shut down
process.once('SIGINT', () => {
    try { telegramBot.stop('SIGINT'); } catch(e) {}
    process.exit(0);
});
process.once('SIGTERM', () => {
    try { telegramBot.stop('SIGTERM'); } catch(e) {}
    process.exit(0);
});
module.exports = { telegramBot };
