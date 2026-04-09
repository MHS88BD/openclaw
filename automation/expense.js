const path = require('path');
const Logger = require('./logger');
const browserManager = require('./browser');
const { injectSession, verifySession } = require('./session');
const JobQueue = require('./queue');

// Smart Input Mapping
function normalizeCategory(text) {
    const map = {
        'lunch': 'food',
        'dinner': 'food',
        'breakfast': 'food',
        'grocery': 'food',
        'fuel': 'transport',
        'uber': 'transport',
        'pathao': 'transport',
        'bus': 'transport',
        'bill': 'service',
        'internet': 'service',
        'recharge': 'service'
    };
    for (const [key, value] of Object.entries(map)) {
        if (text.toLowerCase().includes(key)) return value;
    }
    return text;
}

// Internal expense execution logic
async function executeExpense({ amount, category, note }, retries = 2) {
    const mappedCategory = normalizeCategory(category || note || "");
    const finalNote = note || "auto entry";

    const browser = await browserManager.getBrowser();
    let page;
    try {
        Logger.info("opening_page");
        page = await browser.newPage();
        await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
        await page.setViewport({ width: 1280, height: 800 });

        await injectSession(page);

        Logger.info("opening_dashboard");
        await page.goto('https://web.budgetbakers.com/en-US/dashboard', { waitUntil: 'networkidle2', timeout: 30000 });
        await verifySession(page);

        Logger.info("finding_add_record");
        // Hybrid selector strategy
        const recordSelectors = [
            '[data-testid="add-record-button"]',
            '[aria-label="Add record"]',
            '.add-record-btn'
        ];
        
        let rcBtn = null;
        for(let sel of recordSelectors) {
             if(await page.$(sel)) { rcBtn = await page.$(sel); break; }
        }
        if(!rcBtn) {
             // Fallback text based
             const recordBtnXPath = "//button[contains(., 'Add Record') or contains(., 'Record') or contains(., 'Expense')]";
             await page.waitForXPath(recordBtnXPath, { timeout: 15000 });
             const btns = await page.$x(recordBtnXPath);
             if(btns.length > 0) rcBtn = btns[0];
        }
        if(!rcBtn) throw new Error("Add Record button not found via any selector");
        await rcBtn.click();

        await page.waitForTimeout(2000);

        Logger.info(`inputting_amount_${amount}`);
        const amountSelectors = ['[data-testid="amount-input"]', 'input[type="number"]', 'input[placeholder*="0"]', 'input[name="amount"]'];
        let amountFilled = false;
        for (const sel of amountSelectors) {
            if (await page.$(sel)) {
                await page.click(sel);
                await page.keyboard.down('Control');
                await page.keyboard.press('A');
                await page.keyboard.up('Control');
                await page.keyboard.press('Backspace');
                await page.type(sel, String(amount), { delay: 30 });
                amountFilled = true;
                break;
            }
        }
        if (!amountFilled) throw new Error("Amount input field not found");

        Logger.info(`inputting_note_${mappedCategory}_${finalNote}`);
        const noteSelectors = ['[data-testid="note-input"]', 'input[name="note"]', 'textarea', 'input[placeholder*="note" i]'];
        for (const sel of noteSelectors) {
            if (await page.$(sel)) {
                await page.click(sel);
                await page.type(sel, String(finalNote), { delay: 30 });
                break;
            }
        }
        
        Logger.info("saving_expense");
        const submitXPath = "//button[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'save') or contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'add')]";
        await page.waitForTimeout(1000);
        const saveBtns = await page.$x(submitXPath);
        if (saveBtns.length > 0) {
            await saveBtns[saveBtns.length - 1].click(); 
        } else {
            throw new Error("Save button not found");
        }

        Logger.info("verifying_success");
        try {
            await page.waitForTimeout(3000);
            const isModalStillOpen = await page.$x(submitXPath);
            if (isModalStillOpen.length > 0) {
                 await page.waitForTimeout(2000);
                 const recheck = await page.$x(submitXPath);
                 if (recheck.length > 0) {
                     throw new Error("Form did not close. Submission might have failed.");
                 }
            }
        } catch (verr) {
            throw new Error("Success verification failed: " + verr.message);
        }
        
        Logger.success("expense_added");
        await page.screenshot({ path: path.join(__dirname, 'success.png'), fullPage: true });

        await page.close(); // Only close the page, not the browser to pool it!
        return `✅ Expense added: ${amount}`;

    } catch (error) {
        if (page && !page.isClosed()) {
            try {
                await page.screenshot({ path: path.join(__dirname, 'error.png'), fullPage: true });
                await page.close();
            } catch(e) {}
        }
        
        Logger.error("expense_execution", error.message);
        
        if (retries > 0 && !error.message.includes('Session expired') && !error.message.includes('Session error')) {
            Logger.info(`retrying_left_${retries}`);
            return await executeExpense({ amount, category, note }, retries - 1);
        } else {
            throw new Error(error.message); // throw inside queue so it tracks failures
        }
    }
}

// Queue wrapper
async function addExpense(payload) {
    try {
        Logger.info(`queueing_expense_${payload.amount}`);
        const result = await JobQueue.add('budget-bakers', () => executeExpense(payload));
        return result;
    } catch(err) {
        return `⚠️ Failed: ${err.message}`;
    }
}

module.exports = { addExpense };
