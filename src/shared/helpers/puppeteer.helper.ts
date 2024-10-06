import { Browser, Page } from 'puppeteer';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { connect, PageWithCursor } from 'puppeteer-real-browser';
import randomUseragent from 'random-useragent';

puppeteer.use(StealthPlugin());

export type Proxy = { proxyServer: string; proxyUsername: string; proxyPassword: string } | undefined;

export class PuppeteerHelper {
    private _headless: boolean;

    private _loginBrowser: any;
    private _loginPage: PageWithCursor;

    private _normalBrowser: Browser;
    private _normalPage: Page;

    constructor(headless: boolean) {
        this._headless = headless;
    }

    async startLoginBrowser() {
        const { browser, page } = await connect({
            headless: this._headless,
            args: ['--incognito', '--disable-web-security'],
            turnstile: true,
            disableXvfb: true,
            ignoreAllFlags: false,
            // proxy: {}
        });
        this._loginBrowser = browser;
        this._loginPage = page;

        await this._loginPage.setViewport({ width: 1024, height: 1280, deviceScaleFactor: 1, isLandscape: true });
        await this._loginPage.setUserAgent(randomUseragent.getRandom());
        await this._loginPage.evaluateOnNewDocument(() => {
            window.open = url => {
                window.location.href = url.toString();
                return window;
            };
        });
    }

    async startNormalBrowser() {
        const args = ['--incognito'];

        this._normalBrowser = await puppeteer.launch({
            headless: this._headless,
            args,
            defaultViewport: {
                width: 1024,
                height: 1280,
                deviceScaleFactor: 1,
                isLandscape: true,
            },
        });
        [this._normalPage] = await this._normalBrowser.pages();
    }

    async stopLoginBrownser() {
        await this._loginPage.close();
        await this._loginBrowser.close();
    }

    async stopNormalBrowser() {
        await this._normalPage.close();
        await this._normalBrowser.close();
    }

    async runOnLoginBrowser<T>(f: (page: PageWithCursor) => Promise<T>) {
        return await f(this._loginPage);
    }

    async runOnNormalBrowser<T>(f: (page: Page) => Promise<T>) {
        return await f(this._normalPage);
    }

    //     async start(_proxy: Proxy = undefined) {
    //         const args = [
    //             '--incognito',
    //             // '--no-sandbox',
    //             '--disable-web-security',
    //         ];

    //         const { browser, page } = await connect({
    //             headless: false,
    //             args,
    //             customConfig: {},
    //             turnstile: false,
    //             connectOption: {},
    //             disableXvfb: true,
    //             ignoreAllFlags: false,
    //             // proxy:{
    //             //     host:'<proxy-host>',
    //             //     port:'<proxy-port>',
    //             //     username:'<proxy-username>',
    //             //     password:'<proxy-password>'
    //             // }
    //         });
    //         this._browser = browser;
    //         this._page = page;

    //         await this._page.setViewport({ width: 1024, height: 1280, deviceScaleFactor: 1, isLandscape: true });
    //         await this._page.setUserAgent(randomUseragent.getRandom());
    //         await this._page.evaluateOnNewDocument(() => {
    //             window.open = url => {
    //                 window.location.href = url.toString();
    //                 return window;
    //             };
    //         });
    //     }

    //     async autoScroll(maxScrolls = 50) {
    //         let totalHeight = 0;
    //         let scrolls = 0;

    //         while (true) {
    //             const distance = Math.floor(Math.random() * 350 + 50);
    //             totalHeight += distance;
    //             const shouldBreak = await this._page.evaluate(
    //                 (distance, totalHeight) => {
    //                     window.scrollBy({ top: distance, behavior: 'smooth' });
    //                     return totalHeight >= document.body.scrollHeight - window.innerHeight;
    //                 },
    //                 distance,
    //                 totalHeight,
    //             );
    //             if (shouldBreak || ++scrolls >= maxScrolls) break;
    //             await sleep(Math.floor(Math.random() * 4000 + 1000));
    //         }
    //     }

    //     async redirect(url: string, selector: string) {
    //         await Promise.race([
    //             this._page.goto(url, { waitUntil: 'load' }),
    //             this._page.waitForSelector(selector, { timeout: 3 * 60 * 1000 }),
    //         ]);
    //     }

    //     async stop() {
    //         await this._page.close();
    //         await this._browser.close();
    //     }

    //     // async run<T>(f: (page: Page) => Promise<T>) {
    //     async run<T>(f: (page: PageWithCursor) => Promise<T>) {
    //         return await f(this._page);
    //     }
}
