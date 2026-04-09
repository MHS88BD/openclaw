const { Telegraf } = require('telegraf');
require('dotenv').config();
const { processMessage } = require('./src/messageHandler');
const { connectToWhatsApp } = require('./whatsapp');

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
}

startSystem();

// Graceful shut down
process.once('SIGINT', () => {
    telegramBot.stop('SIGINT');
    process.exit(0);
});
process.once('SIGTERM', () => {
    telegramBot.stop('SIGTERM');
    process.exit(0);
});
module.exports = { telegramBot };
