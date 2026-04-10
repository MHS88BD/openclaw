const fs = require('fs');
const path = require('path');

const MAP_FILE = path.join(__dirname, '../merchant_map.json');

class MerchantMemory {
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

    getCategoryId(merchantName) {
        if (!merchantName) return null;
        const lowerName = merchantName.toLowerCase();
        
        // Match exact or contains
        for (const [key, categoryId] of Object.entries(this.data)) {
            if (lowerName.includes(key.toLowerCase()) || key.toLowerCase().includes(lowerName)) {
                return categoryId;
            }
        }
        return null;
    }

    setMapping(merchantName, categoryId) {
        this.data[merchantName.toLowerCase()] = categoryId;
        this.save();
    }

    getAll() {
        return this.data;
    }
}

module.exports = new MerchantMemory();
