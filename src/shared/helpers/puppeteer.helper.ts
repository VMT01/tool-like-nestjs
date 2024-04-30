import puppeteer, { Browser, Page } from 'puppeteer';

class PuppeteerSingleInstance {
    private _browser: Browser;
    private _page: Page;
    private _headless: boolean;

    constructor(headless: boolean) {
        this._headless = headless;
    }

    async start() {
        this._browser = await puppeteer.launch({
            headless: this._headless,
            args: ['--incognito'],
            defaultViewport: {
                width: 1080,
                height: 1024,
                deviceScaleFactor: 1,
                isLandscape: true,
            },
        });
        [this._page] = await this._browser.pages();
        await this._page.setCacheEnabled(false);
    }

    async stop() {
        await this._page.deleteCookie();
        await this._page.close();
        await this._browser.close();
    }

    async run<T>(f: (page: Page) => Promise<T>) {
        return await f(this._page);
    }
}

export class PuppeteerHelper {
    private _puppeteerInstances: PuppeteerSingleInstance[] = [];

    constructor(instanceNum: number, headless: boolean) {
        for (let i = 0; i < instanceNum; i++) {
            this._puppeteerInstances.push(new PuppeteerSingleInstance(headless));
        }
    }

    async initInstances() {
        const promises = this._puppeteerInstances.map(ppt => ppt.start());
        await Promise.all(promises);
    }

    async killInstances() {
        const promises = this._puppeteerInstances.map(ppt => ppt.stop());
        await Promise.all(promises);
    }

    async runInstances<T>(fs: ((page: Page) => Promise<T>)[]) {
        const promises: Promise<T>[] = [];
        for (let i = 0; i < fs.length; i++) {
            promises.push(this._puppeteerInstances[i].run(fs[i]));
        }
        return await Promise.all(promises);
    }
}
