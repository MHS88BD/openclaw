const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '../auto_reply_config.json');

function loadConfig() {
    if (!fs.existsSync(CONFIG_PATH)) {
        return { enabledJids: [] };
    }
    try {
        return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    } catch (e) {
        return { enabledJids: [] };
    }
}

function saveConfig(config) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function normalize(jid) {
    if (!jid) return "";
    return jid.split('@')[0].split(':')[0];
}

function enableAutoReply(jid) {
    const config = loadConfig();
    const normalizedJid = normalize(jid);
    if (!config.enabledJids.includes(normalizedJid)) {
        config.enabledJids.push(normalizedJid);
        saveConfig(config);
    }
    return true;
}

function disableAutoReply(jid) {
    const config = loadConfig();
    const normalizedJid = normalize(jid);
    config.enabledJids = config.enabledJids.filter(id => id !== normalizedJid);
    saveConfig(config);
    return true;
}

function isAutoReplyEnabled(jid) {
    const config = loadConfig();
    const normalizedJid = normalize(jid);
    return config.enabledJids.includes(normalizedJid);
}

function getEnabledList() {
    return loadConfig().enabledJids;
}

module.exports = {
    enableAutoReply,
    disableAutoReply,
    isAutoReplyEnabled,
    getEnabledList
};
