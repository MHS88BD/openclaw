const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'userMap.json');

class UserManager {
    constructor() {
        this.users = this.loadData();
    }

    loadData() {
        if (fs.existsSync(DB_PATH)) {
            try {
                return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
            } catch (e) {
                return [];
            }
        }
        return [];
    }

    saveData() {
        fs.writeFileSync(DB_PATH, JSON.stringify(this.users, null, 2));
    }

    resolveUser(platform, platformId) {
        if (!platform || !platformId) {
            console.error("Missing mapping info:", platform, platformId);
            return null; // Handle missing mapping safely
        }
        const strId = String(platformId);

        let user = this.users.find(u => platform === 'telegram' ? (u.telegram_id === strId) : (u.whatsapp_id === strId));

        if (!user) {
            // New user, create identity system
            user = {
                telegram_id: platform === 'telegram' ? strId : "",
                whatsapp_id: platform === 'whatsapp' ? strId : "",
                user_id: 'usr_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
                total_spent: 0,
                last_7_days_data: [],
                preferences: {}
            };
            this.users.push(user);
            this.saveData();
        }
        return user;
    }

    linkUser(userId, platform, platformId) {
        if (!userId || !platform || !platformId) return null;
        const strId = String(platformId);

        const user = this.users.find(u => u.user_id === userId);
        if (user) {
            // Safety: Ensure we don't cause duplicate users by overwriting an existing ID that was already attached
            // If they are linking, we could optionally consolidate their data, but for now we just link pointer
            if (platform === 'telegram') user.telegram_id = strId;
            if (platform === 'whatsapp') user.whatsapp_id = strId;

            // Cleanup duplicate temporary user if they were created before linking
            const duplicateIndex = this.users.findIndex(u => u.user_id !== userId && (platform === 'telegram' ? u.telegram_id === strId : u.whatsapp_id === strId));
            if (duplicateIndex !== -1) {
                // If they have spend data, we might lose it, but safety constraint: No duplicate users
                this.users.splice(duplicateIndex, 1);
            }

            this.saveData();
            return user;
        }
        return null;
    }

    getUser(userId) {
        return this.users.find(u => u.user_id === userId);
    }

    updateUser(userId, userObj) {
        const index = this.users.findIndex(u => u.user_id === userId);
        if (index !== -1) {
            this.users[index] = userObj;
            this.saveData();
        }
    }
}

module.exports = new UserManager();
