const path = require('path');
const Logger = require('./logger');
const browserManager = require('./browser');
const { injectSession, verifySession } = require('./session');
const JobQueue = require('./queue');

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Execute BudgetBakers automation
 * @param {Object} payload { amount, category, account, note }
 */
async function executeExpense({ amount, category, account, note }, retries = 1) {
    const browser = await browserManager.getBrowser();
    let page;
    
    try {
        Logger.info(`Starting BudgetBakers entry: ${amount} to ${account}`);
        page = await browser.newPage();
        await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36");
        await page.setViewport({ width: 1280, height: 900 });

        await injectSession(page);

        // 1. Go to dashboard
        await page.goto('https://web.budgetbakers.com/en-US/dashboard', { waitUntil: 'networkidle2', timeout: 30000 });
        await verifySession(page);

        // 2. Click Add Record
        Logger.info("Locating Add Record button");
        const recordBtnSelector = '::-p-xpath(//button[contains(., "Add Record") or contains(., "Record") or contains(., "Expense")])';
        await page.waitForSelector(recordBtnSelector, { timeout: 10000 });
        await page.click(recordBtnSelector);
        
        // Wait for modal
        await delay(2000);

        // 3. Input Amount
        Logger.info("Entering amount");
        const amountSelector = 'input[placeholder="0"]';
        await page.waitForSelector(amountSelector, { timeout: 5000 });
        await page.click(amountSelector);
        
        // Clear field
        await page.keyboard.down('Control');
        await page.keyboard.press('A');
        await page.keyboard.up('Control');
        await page.keyboard.press('Backspace');
        
        await page.type(amountSelector, String(amount), { delay: 50 });

        // 4. Select Account
        Logger.info(`Selecting account: ${account}`);
        const accountBox = await page.$('div[role="button"][class*="account"]');
        if (accountBox) {
            await accountBox.click();
            await delay(1000);
            
            const accountOptionSelector = `::-p-xpath(//div[contains(text(), "${account}") or contains(., "${account}")])`;
            try {
                await page.waitForSelector(accountOptionSelector, { timeout: 3000 });
                await page.click(accountOptionSelector);
            } catch (e) {
                Logger.error(`Account "${account}" not found.`);
                throw new Error(`Account "${account}" আপনার বাজেট-বেকারস লিস্টে খুঁজে পাওয়া যায়নি।`);
            }
        }

        await delay(1000);

        // 5. Select Category
        Logger.info(`Selecting category: ${category}`);
        const categoryBox = await page.$('div[role="button"][class*="category"]');
        if (categoryBox) {
            await categoryBox.click();
            await delay(1000);
            
            const searchInput = await page.$('input[placeholder*="Search"]');
            if (searchInput) {
                await searchInput.type(category, { delay: 50 });
                await delay(1000);
            }
            
            const catOptionSelector = `::-p-xpath(//div[contains(text(), "${category}") or contains(., "${category}")])`;
            try {
                await page.waitForSelector(catOptionSelector, { timeout: 3000 });
                await page.click(catOptionSelector);
            } catch (e) {
                Logger.error(`Category "${category}" not found.`);
                throw new Error(`Category "${category}" আপনার বাজেট-বেকারস লিস্টে খুঁজে পাওয়া যায়নি।`);
            }
        }

        await delay(1000);

        // 6. Input Note
        Logger.info("Adding note");
        const noteSelector = 'textarea[name="note"], input[name="note"]';
        const noteInput = await page.$(noteSelector);
        if (noteInput) {
            await noteInput.type(note, { delay: 20 });
        }

        // 7. Save
        Logger.info("Clicking Save");
        const saveBtnSelector = '::-p-xpath(//button[contains(., "Save") or contains(., "Add")])';
        const saveBtns = await page.$$(saveBtnSelector);
        if (saveBtns.length > 0) {
            await saveBtns[saveBtns.length - 1].click();
        } else {
            throw new Error("Save button not found");
        }

        // 8. Verification
        await delay(4000);
        const modalCheck = await page.$$(saveBtnSelector);
        if (modalCheck.length > 0) {
            throw new Error("Modal didn't close, entry might have failed.");
        }

        Logger.success("Expense Entry Successful");
        await page.close();
        return `✅ Entry Successful!\nAmount: ${amount}\nCategory: ${category}\nAccount: ${account}`;

    } catch (err) {
        Logger.error("Automation Failure", err.message);
        if (page) {
            try {
                await page.screenshot({ path: path.join(__dirname, 'error_expense.png') });
                await page.close();
            } catch(e) {}
        }
        if (retries > 0) {
            Logger.info("Retrying automation...");
            return await executeExpense({ amount, category, account, note }, retries - 1);
        }
        throw err;
    }
}

async function addExpense(payload) {
    try {
        const result = await JobQueue.add('budget-bakers', () => executeExpense(payload));
        return result;
    } catch (err) {
        return `⚠️ Error: ${err.message}`;
    }
}

module.exports = { addExpense };
