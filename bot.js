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
        if (!message) return res.status(400).send({ error: "Message is required" });

        console.log(`[Webhook] Received from ${source || 'api'}: ${message}`);

        const { getSock } = require('./whatsapp');
        const ownerJid = (process.env.OWNER_NUMBER || "").trim();
        const sock = getSock();

        const replyFn = async (text) => {
            console.log(`[Webhook Reply] ${text}`);
            if (sock && ownerJid) {
                await sock.sendMessage(ownerJid, { text: 'ðŸ“§ [NOTIFICATION]\n' + text }).catch(e => {
                    console.error("Webhook WhatsApp Send Error:", e.message);
                });
            }
        };

        try {
            await processMessage(message, sender || 'n8n_webhook', source || 'sms', replyFn, sock);
            res.send({ status: "processing" });
        } catch (err) {
            res.status(500).send({ error: err.message });
        }
    });

    try {
        const server = app.listen(PORT, () => {
            console.log(`🚀 Webhook Server running on port ${PORT}`);
        });

        server.on('error', (e) => {
            if (e.code === 'EADDRINUSE') {
                console.warn(`⚠️ Port ${PORT} is busy. Webhook server failed to start, but bot is running.`);
            } else {
                console.error("Webhook Server Error:", e);
            }
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
