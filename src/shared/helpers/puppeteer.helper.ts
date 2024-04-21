import { Browser, CookieParam, Page, PuppeteerLifeCycleEvent } from 'puppeteer';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

export class PuppeteerHelper {
    private _browser: Browser;
    private _page: Page;
    private readonly _args: string[] = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-infobars',
        '--single-process',
        '--no-zygote',
        '--no-first-run',
        '--ignore-certificate-errors',
        '--ignore-certificate-errors-skip-list',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--hide-scrollbars',
        '--disable-notifications',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-breakpad',
        '--disable-component-extensions-with-background-pages',
        '--disable-extensions',
        '--disable-features=TranslateUI,BlinkGenPropertyTrees',
        '--disable-ipc-flooding-protection',
        '--disable-renderer-backgrounding',
        '--enable-features=NetworkService,NetworkServiceInProcess',
        '--force-color-profile=srgb',
        '--metrics-recording-only',
        '--mute-audio',
        '--enable-unsafe-webgpu',
    ];

    async start(headless: boolean) {
        this._browser = await puppeteer.launch({
            headless,
            args: this._args,
            defaultViewport: {
                width: 1200,
                height: 1200,
                deviceScaleFactor: 1,
                isLandscape: true,
            },
            userDataDir: 'user-puppeteer',
            ignoreHTTPSErrors: true,
        });
        [this._page] = await this._browser.pages();
        await this._page.setCacheEnabled(false);
    }

    async setCookies(cookies: CookieParam[]) {
        await this._page.setCookie(...cookies);
    }

    async reload(waitUntil: PuppeteerLifeCycleEvent | PuppeteerLifeCycleEvent[], timeout = 2 * 60 * 1000) {
        await this._page.reload({ waitUntil, timeout });
    }

    async stop() {
        await this._page.deleteCookie();
        await this._page.close();
        await this._browser.close();
    }

    async go(
        url: string,
        waitUntil: PuppeteerLifeCycleEvent | PuppeteerLifeCycleEvent[],
        selector?: string,
        timeout = 2 * 60 * 1000, // 2 mins
    ) {
        const promises: any[] = [
            this._page.goto(url, { waitUntil, timeout }),
            this._page.waitForNavigation({ waitUntil, timeout }),
        ];
        if (selector) {
            promises.push(this._page.waitForSelector(selector, { timeout }));
        }

        await Promise.allSettled(promises);
    }

    async run<T>(f: (page: Page) => Promise<T>): Promise<T> {
        return await f(this._page);
    }
}
