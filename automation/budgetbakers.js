const puppeteer = require('puppeteer-core');
const path = require('path');

const EXECUTABLE_PATH = process.env.CHROME_PATH || '/usr/bin/chromium-browser';

async function getBrowser() {
    return await puppeteer.launch({
        headless: process.env.HEADLESS !== 'false',
        executablePath: EXECUTABLE_PATH,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,800']
    });
}

function loadCookies() {
    if (!process.env.SESSION_TOKEN || !process.env.CSRF_TOKEN) {
        return null;
    }
    
    const callbackUrl = process.env.CALLBACK_URL ? encodeURIComponent(decodeURIComponent(process.env.CALLBACK_URL)) : "https%3A%2F%2Fweb.budgetbakers.com%2Fen-US%2Fdashboard";

    const cookies = [
      {
        "name": "__Secure-next-auth.session-token",
        "value": process.env.SESSION_TOKEN,
        "domain": "web.budgetbakers.com",
        "path": "/",
        "httpOnly": true,
        "secure": true
      },
      {
        "name": "__Secure-next-auth.callback-url",
        "value": callbackUrl,
        "domain": "web.budgetbakers.com",
        "path": "/",
        "httpOnly": true,
        "secure": true
      },
      {
        "name": "__Host-next-auth.csrf-token",
        "value": process.env.CSRF_TOKEN,
        "domain": "web.budgetbakers.com",
        "path": "/",
        "httpOnly": true,
        "secure": true
      }
    ];
    
    return cookies;
}

async function addExpense({ amount, category, note }, retries = 2) {
    let browser;
    try {
        console.log(`[STEP] launching browser`);
        browser = await getBrowser();
        const page = await browser.newPage();
        
        await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
        await page.setViewport({ width: 1280, height: 800 });

        console.log(`[STEP] injecting cookies`);
        const cookies = loadCookies();
        if (!cookies) {
            throw new Error("Session error: No tokens found in .env.");
        }
        
        await page.goto('https://web.budgetbakers.com', { waitUntil: 'load', timeout: 30000 });
        await page.setCookie(...cookies);
        await page.reload({ waitUntil: 'load' }); // Reload after setting cookies

        console.log(`[STEP] opening dashboard`);
        await page.goto('https://web.budgetbakers.com/en-US/dashboard', { waitUntil: 'networkidle2', timeout: 30000 });

        if (page.url().includes('login') || page.url().includes('auth')) {
            throw new Error("Session expired! Please update SESSION_TOKEN in .env");
        }

        console.log(`[STEP] submitting expense`);
        
        const recordBtnXPath = "//button[contains(., 'Add Record') or contains(., 'Record') or contains(., 'Expense')]";
        await page.waitForXPath(recordBtnXPath, { timeout: 15000 });
        const recordBtns = await page.$x(recordBtnXPath);
        if (recordBtns.length > 0) {
            await recordBtns[0].click();
        } else {
             throw new Error("Add Record button not found");
        }

        await page.waitForTimeout(2000); 

        console.log(`[STEP] inputting amount: ${amount}`);
        const amountSelectors = ['input[type="number"]', 'input[placeholder*="0"]', 'input[name="amount"]'];
        let amountFilled = false;
        for (const sel of amountSelectors) {
            if (await page.$(sel)) {
                await page.click(sel);
                await page.keyboard.down('Control');
                await page.keyboard.press('A');
                await page.keyboard.up('Control');
                await page.keyboard.press('Backspace');
                await page.type(sel, String(amount), { delay: 50 });
                amountFilled = true;
                break;
            }
        }
        if (!amountFilled) throw new Error("Amount input field not found");

        console.log(`[STEP] inputting note/category: ${category || note}`);
        const noteSelectors = ['input[name="note"]', 'textarea', 'input[placeholder*="note" i]'];
        for (const sel of noteSelectors) {
            if (await page.$(sel)) {
                await page.click(sel);
                await page.type(sel, String(category || note), { delay: 50 });
                break;
            }
        }
        
        console.log(`[STEP] clicking save button`);
        const submitXPath = "//button[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'save') or contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'add')]";
        await page.waitForTimeout(1000);
        const saveBtns = await page.$x(submitXPath);
        if (saveBtns.length > 0) {
            await saveBtns[saveBtns.length - 1].click(); 
        } else {
            throw new Error("Save button not found");
        }

        console.log(`[STEP] verifying success`);
        // Wait for modal to disappear or success text
        try {
            // Looking for a typical toast/notification or simply the modal closing
            await page.waitForTimeout(3000);
            const isModalStillOpen = await page.$x(submitXPath);
            if (isModalStillOpen.length > 0) {
                 // Might still be open due to network delay, wait a bit more
                 await page.waitForTimeout(2000);
                 const recheck = await page.$x(submitXPath);
                 if (recheck.length > 0) {
                     throw new Error("Form did not close. Submission might have failed.");
                 }
            }
        } catch (verr) {
            throw new Error("Success verification failed: " + verr.message);
        }
        
        console.log(`[STEP] success`);
        await page.screenshot({ path: path.join(__dirname, 'success.png'), fullPage: true });

        await browser.close();
        return `✅ Expense added: ${amount}`;

    } catch (error) {
        if (browser) {
            try {
                const pages = await browser.pages();
                if (pages.length > 0) {
                    await pages[0].screenshot({ path: path.join(__dirname, 'error.png'), fullPage: true });
                }
            } catch(e) {}
            await browser.close();
        }
        
        console.error(`[BudgetBakers Error] ${error.message}`);
        
        if (retries > 0 && !error.message.includes('Session expired') && !error.message.includes('Session error')) {
            console.log(`[BudgetBakers] Retrying... (${retries} left)`);
            return await addExpense({ amount, category, note }, retries - 1);
        } else {
            return `⚠️ Failed: ${error.message}`;
        }
    }
}

module.exports = { addExpense, getBrowser, loadCookies };
