const userManager = require('../src/userManager');

const DAILY_LIMIT = parseInt(process.env.DAILY_BUDGET_LIMIT || '5000', 10);

class FinanceMemory {
    getTodayStr() {
        return new Date().toISOString().split('T')[0];
    }

    addExpense(userId, amount, category) {
        const user = userManager.getUser(userId);
        if (!user) return;
        
        if (!user.last_7_days_data) user.last_7_days_data = [];
        
        const today = this.getTodayStr();
        user.last_7_days_data.push({
            id: Date.now(),
            amount: parseFloat(amount),
            category: category.toLowerCase().trim(),
            date: today,
            timestamp: new Date().toISOString()
        });

        // Clean up memory > 7 days to keep it lightweight
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        user.last_7_days_data = user.last_7_days_data.filter(t => new Date(t.timestamp) >= sevenDaysAgo);

        // Update total_spent
        user.total_spent = (user.total_spent || 0) + parseFloat(amount);
        
        userManager.updateUser(userId, user);
    }

    checkBudget(userId) {
        const user = userManager.getUser(userId);
        if (!user || !user.last_7_days_data) return "";

        const today = this.getTodayStr();
        const todayTotal = user.last_7_days_data
            .filter(t => t.date === today)
            .reduce((sum, t) => sum + t.amount, 0);
            
        if (todayTotal > DAILY_LIMIT) {
            return `\n⚠️ *Alert:* Daily budget (${DAILY_LIMIT}) exceeded! (Total: ${todayTotal})`;
        }
        return "";
    }

    getReport(userId, period) {
        const user = userManager.getUser(userId);
        if (!user || (!user.last_7_days_data && user.total_spent === 0)) {
            return `No transactions found.`;
        }
        
        const data = user.last_7_days_data || [];
        const today = this.getTodayStr();
        let targetTransactions = [];

        if (period === 'today') {
            targetTransactions = data.filter(t => t.date === today);
        } else if (period === 'week') {
            targetTransactions = data;
        }

        if (targetTransactions.length === 0) {
            return `No transactions found for ${period}. Your total lifetime spend is ${user.total_spent || 0} BDT.`;
        }

        const total = targetTransactions.reduce((sum, t) => sum + t.amount, 0);
        const cats = {};
        targetTransactions.forEach(t => {
            cats[t.category] = (cats[t.category] || 0) + t.amount;
        });

        let topCat = null;
        let maxVal = -1;
        const breakdowns = [];
        for (const [c, val] of Object.entries(cats)) {
            breakdowns.push(`- ${c.charAt(0).toUpperCase() + c.slice(1)}: ${val}`);
            if (val > maxVal) {
                maxVal = val;
                topCat = c;
            }
        }

        let insight = "";
        if (topCat && maxVal > (total * 0.5)) {
            insight = `💡 Insight: You're spending mostly on ${topCat} (${Math.round((maxVal/total)*100)}% of total).`;
        }

        return `📊 *${period.charAt(0).toUpperCase() + period.slice(1)} Report*\nTotal this ${period}: ${total} BDT\nLifetime spent: ${user.total_spent} BDT\n\n*Breakdown:*\n${breakdowns.join("\n")}\n\n*Top:* ${topCat}\n${insight}`;
    }
}

module.exports = new FinanceMemory();
