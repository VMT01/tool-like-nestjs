import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { connect, PageWithCursor, ProxyOptions } from 'puppeteer-real-browser';
import randomUseragent from 'random-useragent';

puppeteer.use(StealthPlugin());

export type Proxy = { proxyServer: string; proxyUsername: string; proxyPassword: string };

export class PuppeteerHelper {
    private _headless: boolean;

    private _proxy?: ProxyOptions;

    private _loginBrowser: any;
    private _loginPage: PageWithCursor;

    private _normalBrowser: any;
    private _normalPage: PageWithCursor;

    constructor(headless: boolean, resetProxy?: string) {
        this._headless = headless;

        if (resetProxy) {
            console.log(resetProxy);
            const regex = /^([a-zA-Z0-9._-]+):([^@]+)@([a-zA-Z0-9.-]+):(\d+)$/;
            const [, username, password, host, port] = resetProxy.match(regex);
            this._proxy = { host, port: Number(port), username, password };
        }
    }

    /* ---------- Browser with cursor ---------- */

    async startLoginBrowser() {
        const args = ['--incognito', '--disable-web-security'];
        if (this._proxy) {
            args.push(`--proxy-server=${this._proxy.host}:${this._proxy.port}`);
        }

        const { browser, page } = await connect({
            args,
            headless: this._headless,
            turnstile: true,
            disableXvfb: true,
            ignoreAllFlags: false,
        });
        this._loginBrowser = browser;
        this._loginPage = page;

        if (this._proxy) {
            await this._loginPage.authenticate({ username: this._proxy.username, password: this._proxy.password });
        }

        await this._loginPage.setViewport({ width: 1024, height: 1280, deviceScaleFactor: 1, isLandscape: true });
        await this._loginPage.setUserAgent(randomUseragent.getRandom());
        await this._loginPage.evaluateOnNewDocument(() => {
            window.open = url => {
                window.location.href = url.toString();
                return window;
            };
        });

        const timeoutMultiplier = this._proxy ? 6 : 3;
        this._loginPage.setDefaultNavigationTimeout(60 * 1000 * timeoutMultiplier);
        this._loginPage.setDefaultTimeout(60 * 1000 * timeoutMultiplier);
    }

    async stopLoginBrownser() {
        await this._loginPage.close();
        await this._loginBrowser.close();
    }

    async runOnLoginBrowser<T>(f: (page: PageWithCursor) => Promise<T>) {
        return await f(this._loginPage);
    }

    /* ---------- Normal browser ---------- */

    async startNormalBrowser() {
        const args = ['--incognito', '--no-sandbox', '--disable-setuid-sandbox'];
        if (this._proxy) {
            args.push(`--proxy-server=${this._proxy.host}:${this._proxy.port}`);
        }

        // this._normalBrowser = await puppeteer.launch({
        //     headless: this._headless,
        //     args,
        //     defaultViewport: {
        //         width: 1024,
        //         height: 1280,
        //         deviceScaleFactor: 1,
        //         isLandscape: true,
        //     },
        // });
        // [this._normalPage] = await this._normalBrowser.pages();
        const { browser, page } = await connect({
            args,
            headless: this._headless,
            turnstile: true,
            disableXvfb: true,
            ignoreAllFlags: false,
        });
        this._normalBrowser = browser;
        this._normalPage = page;

        if (this._proxy) {
            await this._normalPage.authenticate({ username: this._proxy.username, password: this._proxy.password });
        }

        await this._normalPage.setViewport({ width: 1024, height: 1280, deviceScaleFactor: 1, isLandscape: true });
        await this._normalPage.setUserAgent(randomUseragent.getRandom());
        await this._normalPage.evaluateOnNewDocument(() => {
            window.open = url => {
                window.location.href = url.toString();
                return window;
            };
        });

        const timeoutMultiplier = this._proxy ? 6 : 3;
        this._normalPage.setDefaultNavigationTimeout(60 * 1000 * timeoutMultiplier);
        this._normalPage.setDefaultTimeout(60 * 1000 * timeoutMultiplier);
    }

    async stopNormalBrowser() {
        await this._normalPage.close();
        await this._normalBrowser.close();
    }

    // async runOnNormalBrowser<T>(f: (page: Page) => Promise<T>) {
    async runOnNormalBrowser<T>(f: (page: PageWithCursor) => Promise<T>) {
        return await f(this._normalPage);
    }
}
