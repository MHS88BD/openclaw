const Logger = require('./logger');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

function loadCookies() {
    Logger.info("env_tokens_loaded", {
        hasSession: !!process.env.SESSION_TOKEN,
        hasCsrf: !!process.env.CSRF_TOKEN
    });

    if (!process.env.SESSION_TOKEN || !process.env.CSRF_TOKEN) {
        Logger.error("session", "Missing tokens in .env");
        return null; // Return null gracefully
    }
    
    const callbackUrl = process.env.CALLBACK_URL ? encodeURIComponent(decodeURIComponent(process.env.CALLBACK_URL)) : "https%3A%2F%2Fweb.budgetbakers.com%2Fen-US%2Fdashboard";

    return [
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
}

async function injectSession(page) {
    Logger.info("injecting_cookies");
    const cookies = loadCookies();
    if (!cookies) {
        throw new Error("Session error: No tokens found in .env.");
    }
    
    // Go to base domain to allow setting cookies for the exact domain
    await page.goto('https://web.budgetbakers.com', { waitUntil: 'load', timeout: 30000 });
    await page.setCookie(...cookies);
    await page.reload({ waitUntil: 'load' }); 
}

async function verifySession(page) {
    Logger.info("verifying_session");
    if (page.url().includes('login') || page.url().includes('auth')) {
        throw new Error("Session expired! Please update SESSION_TOKEN in .env");
    }
}

module.exports = { injectSession, verifySession };
