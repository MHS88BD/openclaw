/**
 * PRODUCTION-GRADE WHATSAPP BOT (BAILEYS)
 * Fix: Removed forced logout logic, handled 440 conflict, and 401 stability.
 */

const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason, 
    fetchLatestBaileysVersion,
    downloadMediaMessage 
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const { processMessage } = require('./src/messageHandler');
const { transcribeAudio } = require('./src/voice');
const scheduler = require('./src/scheduler');

let sock = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth');
    const { version } = await fetchLatestBaileysVersion();

    // Clean up previous instance WITHOUT logging out
    if (sock) {
        sock.ev.removeAllListeners();
        try { sock.ws.close(); } catch (e) {} 
        sock = null;
    }

    sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: ['Ubuntu', 'Chrome', '121.0.6167.184'],
        syncFullHistory: false,
        markOnlineOnConnect: true,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0,
        keepAliveIntervalMs: 15000
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('>> SCAN QR CODE TO LOGIN:');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'open') {
            console.log('✅ WhatsApp Connected');
            reconnectAttempts = 0;
            
            // Require bot instance dynamically to avoid circular dependencies if any
            const { telegramBot } = require('./bot');
            scheduler.startWorker(sock, telegramBot);
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const message = lastDisconnect?.error?.message;
            
            // Handle Conflicts and Logouts
            if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
                console.error('❌ Session Logged Out. Please re-scan QR.');
                // No forced deletion of auth folder; let user handle manually
                process.exit(0);
            } else if (statusCode === 440) {
                console.warn('⚠️ Conflict detected. Retrying in 60s...');
                setTimeout(startBot, 60000); // Wait longer for conflicts
            } else if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                reconnectAttempts++;
                const delay = Math.pow(2, reconnectAttempts) * 1000;
                console.log(`🔄 Reconnecting (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}) in ${delay/1000}s...`);
                setTimeout(startBot, delay);
            } else {
                console.error(`🛑 Connection closed: ${message}. Reconnect failed.`);
                process.exit(1);
            }
        }
    });

    sock.ev.on('messages.upsert', async m => {
        try {
            const msg = m.messages[0];
            if (!msg.message) return;

            let sender = msg.key.remoteJid;
            
            const originalSender = sender;
            // Handle multi-device JIDs (e.g. 12345:2@s.whatsapp.net -> 12345@s.whatsapp.net)
            if (sender.includes(':')) {
                sender = sender.split(':')[0] + '@s.whatsapp.net';
            }
            
            const isFromMe = msg.key.fromMe;
            const ownerJid = process.env.OWNER_NUMBER;

            // Bot loop prevention: Messages sent by Baileys usually start with BAE5 or 3EB0.
            // If the message is fromMe AND it was sent by this bot instance, ignore it!
            if (isFromMe && msg.key.id && (msg.key.id.startsWith('BAE5') || msg.key.id.startsWith('3EB0') || msg.key.id.length === 16)) {
                return;
            }

            let text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";

            console.log(`[WA PRE-FILTER] Original: ${originalSender}, parsedSender: ${sender}, owner: ${ownerJid}, isFromMe: ${isFromMe}, text: ${text}`);

            // Guaranteed bot loop prevention
            if (text.startsWith('\u200B')) {
                return;
            }

            const ownerLid = '107168208580730@lid';
            // Strict Filter: Only allow self messages if they match the exact OWNER_NUMBER JID or LID
            if (isFromMe && sender !== ownerJid && sender !== ownerLid) {
                console.log(`[WA FILTERED] Ignored self message because parsedSender !== ownerJid neither ownerLid`);
                return;
            }

            // Handle Audio/Voice Command
            if (msg.message.audioMessage) {
                const buffer = await downloadMediaMessage(msg, 'buffer', {});
                const transcription = await transcribeAudio(buffer).catch(() => null);
                if (transcription) text = transcription;
            }

            console.log(`[WA DEBUG] Sender: ${sender}, isFromMe: ${isFromMe}, text: ${text}`);

            // If it's empty, ignore
            if (!text) return;

            // WhatsApp requires 'ai' prefix ONLY IF it is not the owner chatting with the bot directly.
            // Since we already filtered out non-owner 'isFromMe', it's safe to allow owner to chat naturally.
            if (sender !== ownerJid && sender !== ownerLid && !text.toLowerCase().startsWith('ai')) {
                return;
            }

            const reply = async (txt) => await sock.sendMessage(sender, { text: '\u200B' + txt }, { quoted: msg });
            await processMessage(text, sender, 'whatsapp', reply, sock);
        } catch (err) {
            console.error("Handler Error:", err.message);
        }
    });
}

// Compatibility Export
module.exports = { connectToWhatsApp: startBot };

if (require.main === module) {
    startBot();
}
