const axios = require('axios');
require('dotenv').config();

const BASE_URL = 'https://rest.budgetbakers.com';
const BB_TOKEN = process.env.BB_TOKEN;

class BudgetApi {
    async createRecord({ amount, categoryId, accountId, note, date }) {
        if (!BB_TOKEN) {
            throw new Error("Missing BB_TOKEN in environment variables.");
        }

        const payload = {
            amount: parseFloat(amount),
            currencyId: 'BDT', // Defaulting to BDT based on prompt
            categoryId: categoryId,
            accountId: accountId,
            note: note || "automated_entry",
            date: date || new Date().toISOString()
        };

        try {
            const response = await axios.post(`${BASE_URL}/records`, payload, {
                headers: {
                    'Authorization': `Bearer ${BB_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            });
            return response.data;
        } catch (err) {
            const errorMsg = err.response?.data?.message || err.message;
            console.error("[BudgetAPI Error]", errorMsg);
            throw new Error(errorMsg);
        }
    }

    // Helper to fetch valid IDs for training/reference
    async getAccounts() {
        try {
            const response = await axios.get(`${BASE_URL}/accounts`, {
                headers: { 'Authorization': `Bearer ${BB_TOKEN}` }
            });
            return response.data;
        } catch (err) {
            console.error("Failed to fetch accounts:", err.message);
            return [];
        }
    }

    async getCategories() {
        try {
            const response = await axios.get(`${BASE_URL}/categories`, {
                headers: { 'Authorization': `Bearer ${BB_TOKEN}` }
            });
            return response.data;
        } catch (err) {
            console.error("Failed to fetch categories:", err.message);
            return [];
        }
    }
}

module.exports = new BudgetApi();
