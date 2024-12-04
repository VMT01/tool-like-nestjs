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

    private _loginBrowser: any;
    private _loginPage: PageWithCursor;

    private _normalBrowser: Browser;
    private _normalPage: Page;

    constructor(headless: boolean, resetProxy?: string) {
        this._headless = headless;

        if (resetProxy) {
            const regex = /^(\w+):(\w+)@([0-9.]+):(\d+)$/;
            const [, username, password, host, port] = resetProxy.match(regex);
            this._proxy = { host, port: Number(port), username, password };
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

        if (this._proxy) {
            const apiKey = '5037ddcb-e786-48dd-8ee1-e0895d3aa89a';
            console.log('TRY RESET PROXY');
            await fetch(
                `https://api.proxymart.net/api/change-ip?api_key=${apiKey}&host=${this._proxy.host}&port=${this._proxy.port}`,
            );
            console.log('RESET PROXY DONE');
        }

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
        if (this._proxy) {
            const apiKey = '4e45fa2d-dd46-9ee1-924ebef5eedd';
            const res: any = await axios.get(`https://proxymart.pro/key/get-current-ip?key=${apiKey}`);
            console.log(res);
            args.push(`--proxy-server=${res.host}:${res.port}`);
        }

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

        // if (this._proxy) {
        //     console.log('TRY RESET PROXY');
        //     // await this._normalPage.authenticate({ username: this._proxy.username, password: this._proxy.password });
        //     // const apiKey = '5037ddcb-e786-48dd-8ee1-e0895d3aa89a';
        //     // console.log('TRY RESET PROXY');
        //     // await fetch(
        //     //     `https://api.proxymart.net/api/change-ip?api_key=${apiKey}&host=${this._proxy.host}&port=${this._proxy.port}`,
        //     // );
        //     console.log('RESET PROXY DONE');
        // }

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
