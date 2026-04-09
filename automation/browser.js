const puppeteer = require('puppeteer-core');
const Logger = require('./logger');

const EXECUTABLE_PATH = process.env.CHROME_PATH || '/usr/bin/chromium-browser';

class BrowserManager {
    constructor() {
        this.browser = null;
    }

    async getBrowser() {
        if (!this.browser || !this.browser.isConnected()) {
            Logger.info("launching_new_browser_instance");
            this.browser = await puppeteer.launch({
                headless: process.env.HEADLESS !== 'false',
                executablePath: EXECUTABLE_PATH,
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,800']
            });
            
            // Auto close if disconnected
            this.browser.on('disconnected', () => {
                Logger.info("browser_disconnected");
                this.browser = null;
            });
        } else {
            Logger.info("reusing_browser_instance");
        }
        return this.browser;
    }

    async closeBrowser() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
    }
}

// Export singleton
module.exports = new BrowserManager();
