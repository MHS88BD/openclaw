const pino = require('pino');
const qrcode = require('qrcode-terminal');
const Baileys = require('@whiskeysockets/baileys');
const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason, 
    fetchLatestBaileysVersion,
    downloadMediaMessage 
} = Baileys;

const { processMessage } = require('./src/messageHandler');
const { transcribeAudio } = require('./src/voice');
const scheduler = require('./src/scheduler');
const unreadHandler = require('./src/unreadHandler');
const autoReplyManager = require('./src/autoReplyManager');

let sock = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

function getNumericalId(jid) {
    if (!jid) return '';
    return jid.split('@')[0].split(':')[0];
}

async function startBot() {
    console.log("🚀 [WA] Initializing WhatsApp Socket with Auto-Reply Support...");
    const { state, saveCreds } = await useMultiFileAuthState('auth');
    
    let version;
    try {
        const v = await fetchLatestBaileysVersion();
        version = v.version;
    } catch (e) {
        version = [2, 3000, 1015901307];
    }

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
        browser: ['Mac OS', 'Chrome', '121.0.6167.184'],
        syncFullHistory: false,
        markOnlineOnConnect: true,
        connectTimeoutMs: 90000,
        defaultQueryTimeoutMs: 90000,
        keepAliveIntervalMs: 30000,
    });

    // PAIRING CODE logic remains
    const ownerNumber = (process.env.OWNER_NUMBER || "").split('@')[0];
    if (ownerNumber && !sock.authState.creds.registered) {
        console.log(`📡 [WA] Generating Pairing Code for ${ownerNumber}...`);
        setTimeout(async () => {
            try {
                const code = await sock.requestPairingCode(ownerNumber);
                console.log(`\n✅ YOUR PAIRING CODE: ${code}\n`);
            } catch (err) {
                console.error("❌ Failed to get pairing code:", err.message);
            }
        }, 5000);
    }

    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('chats.upsert', chats => chats.forEach(c => unreadHandler.updateChat(c)));
    sock.ev.on('chats.update', updates => updates.forEach(u => unreadHandler.updateChat(u)));

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) qrcode.generate(qr, { small: true });
        if (connection === 'open') {
            console.log('✅ [WA] WhatsApp Connected');
            reconnectAttempts = 0;
            const { telegramBot } = require('./bot');
            scheduler.startWorker(sock, telegramBot);
        }
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const errorMsg = lastDisconnect?.error?.message;
            console.log(`[WA] Connection Closed. Status Code: ${statusCode}, Error: ${errorMsg}`);
            if (statusCode !== DisconnectReason.loggedOut && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                reconnectAttempts++;
                console.log(`[WA] Reconnecting (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
                setTimeout(startBot, 5000);
            }
        }
    });

    sock.ev.on('messages.upsert', async m => {
        const msg = m.messages[0];
        if (!msg || !msg.message || msg.key.remoteJid === 'status@broadcast') return;

        try {
            const rawSender = msg.key.remoteJid;
            const participant = msg.key.participant || rawSender;
            const isFromMe = msg.key.fromMe;
            const msgId = msg.key.id;
            const ownerRaw = (process.env.OWNER_NUMBER || "").trim();
            const ownerLidRaw = (process.env.OWNER_LID || "").trim();

            const authorId = getNumericalId(participant);
            const ownerId = getNumericalId(ownerRaw);
            const ownerLid = getNumericalId(ownerLidRaw);
            
            if (isFromMe && msgId && (msgId.startsWith('BAE5') || msgId.startsWith('3EB0'))) return;

            let text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
            if (text.startsWith('\u200B')) return;

            const isSelfChat = (rawSender === ownerRaw || rawSender === ownerLidRaw);
            const startsWithAI = text.toLowerCase().startsWith('ai');
            const autoReplyEnabled = autoReplyManager.isAutoReplyEnabled(rawSender);
            
            // Response Logic
            let shouldProcess = false;
            let isAutoResponse = false;

            if (isSelfChat) {
                shouldProcess = true; // Always respond to owner in self chat
            } else if (startsWithAI) {
                shouldProcess = true; // Always respond to ai commands
                // STEALTH: Delete the initial command message after 2s if not in self-chat
                if (!isSelfChat && isFromMe) {
                    setTimeout(async () => {
                        try {
                            await sock.sendMessage(rawSender, { delete: msg.key });
                        } catch (e) {}
                    }, 2000);
                }
            } else if (autoReplyEnabled && !isFromMe) {
                shouldProcess = true; // Auto-respond to others if enabled
                isAutoResponse = true; // Mark as auto-response for human-like delay
            }

            if (!shouldProcess) return;

            if (!isFromMe) unreadHandler.addMessage(msg, false);

            if (msg.message.audioMessage) {
                try {
                    const buffer = await downloadMediaMessage(msg, 'buffer', {});
                    const transcription = await transcribeAudio(buffer);
                    if (transcription) text = transcription;
                } catch (e) {}
            }

            if (!text || !text.trim()) return;

            const reply = async (txt) => {
                // Humanity delay for auto responses
                if (isAutoResponse) {
                    const delay = Math.floor(Math.random() * (12000 - 5000 + 1) + 5000);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
                
                await sock.sendMessage(rawSender, { text: '\u200B' + txt }, { quoted: msg }).catch(async () => {
                    await sock.sendMessage(rawSender, { text: '\u200B' + txt });
                });
            };
            
            await processMessage(text, rawSender, 'whatsapp', reply, sock, participant);
        } catch (err) {
            console.error("[WA ERROR] Handler:", err.message);
        }
    });
}

module.exports = { connectToWhatsApp: startBot, getSock: () => sock };

if (require.main === module) {
    startBot();
}
