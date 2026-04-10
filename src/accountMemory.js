const fs = require('fs');
const path = require('path');

const MAP_FILE = path.join(__dirname, '../account_map.json');

class AccountMemory {
    constructor() {
        this.data = this.load();
    }

    load() {
        if (fs.existsSync(MAP_FILE)) {
            try {
                return JSON.parse(fs.readFileSync(MAP_FILE, 'utf-8'));
            } catch (e) {
                return {};
            }
        }
        return {};
    }

    save() {
        fs.writeFileSync(MAP_FILE, JSON.stringify(this.data, null, 2));
    }

    getAccountId(keyword) {
        // Simple case-insensitive match
        const lowerKeyword = keyword.toLowerCase();
        for (const [key, id] of Object.entries(this.data)) {
            if (lowerKeyword.includes(key.toLowerCase()) || key.toLowerCase().includes(lowerKeyword)) {
                return id;
            }
        }
        return null;
    }

    setMapping(keyword, accountId) {
        this.data[keyword] = accountId;
        this.save();
    }

    getAll() {
        return this.data;
    }
}

module.exports = new AccountMemory();
