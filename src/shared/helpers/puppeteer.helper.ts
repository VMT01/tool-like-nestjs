import { Browser, Page } from 'puppeteer';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { connect, PageWithCursor } from 'puppeteer-real-browser';
import randomUseragent from 'random-useragent';

puppeteer.use(StealthPlugin());

export type Proxy = { proxyServer: string; proxyUsername: string; proxyPassword: string };

export class PuppeteerHelper {
    private _headless: boolean;

    private _loginBrowser: any;
    private _loginPage: PageWithCursor;

    private _normalBrowser: Browser;
    private _normalPage: Page;

    constructor(headless: boolean) {
        this._headless = headless;
    }

    async startLoginBrowser(proxy?: Proxy) {
        const { browser, page } = await connect({
            headless: this._headless,
            args: ['--incognito', '--disable-web-security'],
            turnstile: true,
            disableXvfb: true,
            ignoreAllFlags: false,
            proxy: proxy && {
                host: proxy.proxyServer.split(':')[0],
                port: Number(proxy.proxyServer.split(':')[1]),
                username: proxy.proxyUsername,
                password: proxy.proxyPassword,
            },
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

    async startNormalBrowser(proxy: Proxy) {
        const args = ['--incognito'];
        if (proxy) args.push(`--proxy-server=${proxy}`);

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
        await this._loginPage.setUserAgent(randomUseragent.getRandom());

        if (proxy) {
            await this._normalPage.authenticate({ username: proxy.proxyUsername, password: proxy.proxyPassword });
        }
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
}
