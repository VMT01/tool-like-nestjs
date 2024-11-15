import axios from 'axios';
import { Browser, Page } from 'puppeteer';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { connect, PageWithCursor, ProxyOptions } from 'puppeteer-real-browser';
import randomUseragent from 'random-useragent';

puppeteer.use(StealthPlugin());

export type Proxy = { proxyServer: string; proxyUsername: string; proxyPassword: string };

export class PuppeteerHelper {
    private _headless: boolean;

    private _proxy?: ProxyOptions;
    private _resetLink?: string;

    private _loginBrowser: any;
    private _loginPage: PageWithCursor;

    private _normalBrowser: Browser;
    private _normalPage: Page;

    constructor(headless: boolean, resetProxy?: string) {
        this._headless = headless;

        if (resetProxy) {
            const regex = /^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}):(\d{1,5}):(https?:\/\/.+\/reset\?proxy=\d{1,5})$/;
            const [, host, port, resetLink] = resetProxy.match(regex);
            this._proxy = { host, port: Number(port) };
            this._resetLink = resetLink;
        }
    }

    /* ---------- Browser with cursor ---------- */

    async startLoginBrowser() {
        const { browser, page } = await connect({
            headless: this._headless,
            args: ['--incognito', '--disable-web-security'],
            turnstile: true,
            disableXvfb: true,
            ignoreAllFlags: false,
            proxy: this._proxy,
        });
        this._loginBrowser = browser;
        this._loginPage = page;

        // if (this._proxy) {
        //     console.log('TRY RESET PROXY:', this._resetLink);
        //     const res = await axios.get(this._resetLink);
        //     console.log('RESET PROXY RES', res);
        // }

        const timeoutMultiplier = this._proxy ? 6 : 3;
        this._loginPage.setDefaultNavigationTimeout(60 * 1000 * timeoutMultiplier);

        await this._loginPage.setViewport({ width: 1024, height: 1280, deviceScaleFactor: 1, isLandscape: true });
        await this._loginPage.setUserAgent(randomUseragent.getRandom());
        await this._loginPage.evaluateOnNewDocument(() => {
            window.open = url => {
                window.location.href = url.toString();
                return window;
            };
        });
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
        if (this._proxy) args.push(`--proxy-server=${this._proxy.host}:${this._proxy.port}`);

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
        // if (this._proxy) await fetch(this._resetLink);

        await this._normalPage.setUserAgent(randomUseragent.getRandom());

        const timeoutMultiplier = this._proxy ? 6 : 3;
        this._normalPage.setDefaultNavigationTimeout(60 * 1000 * timeoutMultiplier);
    }

    async stopNormalBrowser() {
        await this._normalPage.close();
        await this._normalBrowser.close();
    }

    async runOnNormalBrowser<T>(f: (page: Page) => Promise<T>) {
        return await f(this._normalPage);
    }
}
