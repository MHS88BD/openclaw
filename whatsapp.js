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

let sock = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

function getNumericalId(jid) {
    if (!jid) return '';
    return jid.split('@')[0].split(':')[0];
}

async function startBot() {
    console.log("🚀 [WA] Initializing WhatsApp Socket with Pairing Code Support...");
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
        printQRInTerminal: false, // Disable QR as we want Pairing Code
        logger: pino({ level: 'silent' }),
        browser: ['Mac OS', 'Chrome', '121.0.6167.184'],
        syncFullHistory: false,
        markOnlineOnConnect: true,
        connectTimeoutMs: 90000,
        defaultQueryTimeoutMs: 90000,
        keepAliveIntervalMs: 30000,
    });

    // --- PAIRING CODE LOGIC ---
    const ownerNumber = (process.env.OWNER_NUMBER || "").split('@')[0];
    if (ownerNumber && !sock.authState.creds.registered) {
        console.log(`📡 [WA] Generating Pairing Code for ${ownerNumber}...`);
        setTimeout(async () => {
            try {
                const code = await sock.requestPairingCode(ownerNumber);
                console.log(`\n\n************************************************`);
                console.log(`✅ YOUR PAIRING CODE: ${code}`);
                console.log(`************************************************\n\n`);
                console.log(`Instructions:`);
                console.log(`1. Open WhatsApp -> Linked Devices -> Link a Device`);
                console.log(`2. Click 'Link with phone number instead'`);
                console.log(`3. Enter the code above: ${code}`);
            } catch (err) {
                console.error("❌ Failed to get pairing code:", err.message);
            }
        }, 5000); // Wait 5s for socket to be ready
    }
    // -------------------------

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('chats.upsert', chats => chats.forEach(c => unreadHandler.updateChat(c)));
    sock.ev.on('chats.update', updates => updates.forEach(u => unreadHandler.updateChat(u)));

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (connection === 'open') {
            console.log('✅ [WA] WhatsApp Connected via Pairing Code');
            reconnectAttempts = 0;
            const { telegramBot } = require('./bot');
            scheduler.startWorker(sock, telegramBot);
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const reason = lastDisconnect?.error?.message;
            if (statusCode === DisconnectReason.loggedOut) {
                console.error('🛑 [WA] Logged out.');
            } else if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                reconnectAttempts++;
                setTimeout(startBot, 5000);
            } else {
                process.exit(1);
            }
        }
    });

    sock.ev.on('messages.upsert', async m => {
        const msg = m.messages[0];
        if (!msg || !msg.message || msg.key.remoteJid === 'status@broadcast') return;

        try {
            const rawSender = msg.key.remoteJid;
            const participant = msg.key.participant || rawSender; // Group author
            const isFromMe = msg.key.fromMe;
            const msgId = msg.key.id;
            const ownerRaw = (process.env.OWNER_NUMBER || "").trim();
            const ownerLidRaw = '107168208580730@lid';

            const authorId = getNumericalId(participant);
            const ownerId = getNumericalId(ownerRaw);
            const ownerLid = getNumericalId(ownerLidRaw);
            const isOwner = isFromMe || (authorId === ownerId || authorId === ownerLid);

            if (isFromMe && msgId && (msgId.startsWith('BAE5') || msgId.startsWith('3EB0'))) return;

            let text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
            if (text.startsWith('\u200B')) return;

            console.log(`[WA MSG] owner:${isOwner} text:${text.substring(0, 30)}`);

            if (!isOwner && !text.toLowerCase().startsWith('ai')) return;
            if (isFromMe && !isOwner && !text.toLowerCase().startsWith('ai')) return;

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

module.exports = { connectToWhatsApp: startBot };

if (require.main === module) {
    startBot();
}
