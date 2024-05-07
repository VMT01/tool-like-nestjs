import puppeteer, { Browser, Page } from 'puppeteer';

export class PuppeteerHelper {
    private _headless: boolean;
    private _browser: Browser;
    private _page: Page;

    constructor(headless: boolean) {
        this._headless = headless;
    }

    async start(proxy?: string, username?: string, password?: string) {
        const args = ['--incognito'];
        if (proxy) args.push(`--proxy-server=${proxy}`);

        this._browser = await puppeteer.launch({
            headless: this._headless,
            args,
            defaultViewport: {
                width: 1024,
                height: 1280,
                deviceScaleFactor: 1,
                isLandscape: true,
            },
        });
        [this._page] = await this._browser.pages();

        if (proxy) await this._page.authenticate({ username, password });
    }

    async stop() {
        await this._page.close();
        await this._browser.close();
    }

    async run<T>(f: (page: Page) => Promise<T>) {
        return await f(this._page);
    }
}
