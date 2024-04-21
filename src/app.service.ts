import { Page } from 'puppeteer';

import { Injectable } from '@nestjs/common';

import { cookies } from '../vnexpress.net_18-04-2024.json';
import { PuppeteerHelper } from './shared/helpers/puppeteer.helper';

@Injectable()
export class AppService {
    constructor(private readonly _ppt: PuppeteerHelper) {}

    getHello(): string {
        return 'Hello World!';
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async like({ url, account, comment }: any) {
        await this._ppt.start(false);

        try {
            await this._ppt.go(url, 'networkidle0');
            await this._ppt.setCookies(cookies.map(cookie => ({ ...cookie, sameSite: 'None' })));
            await this._ppt.reload('networkidle0');

            // const [username, password] = account.split('|');
            // await this._ppt.run(this._login(username, password));
        } catch (err) {
            console.log(err.message);
        } finally {
            console.log('Done. Wait for 5s to cleanup...');
            // Wait for 10s
            // await this._ppt.wait(5_000);
            // await this._ppt.stop();
        }
    }

    private _login(username: string, password: string) {
        // eslint-disable-next-line prettier/prettier
        return async function (page: Page) {
            await page.$eval('.myvne_login_button', e => (<HTMLButtonElement>e).click());
            const frame = await page.waitForFrame(f => f.url().includes('https://my.vnexpress.net/authen/users'));
            if (!frame) throw new Error('Frame not found');

            await new Promise(rs => setTimeout(rs, 2_000));
            await frame.waitForSelector('#myvne_email_input', {
                timeout: 2 * 60 * 1000, // 2 mins
            });

            while (true) {
                // Enter username
                await frame.click('#myvne_email_input', { count: 3 });
                await frame.type('#myvne_email_input', username, { delay: 100 });

                // Enter password
                await frame.click('#myvne_password_input', { count: 3 });
                await frame.type('#myvne_password_input', password, { delay: 100 });

                // Check for correct username and password
                const [typedUsername, typedPassword] = await Promise.all([
                    frame.$eval('#myvne_email_input', e => (e as HTMLInputElement).value),
                    frame.$eval('#myvne_password_input', e => (e as HTMLInputElement).value),
                ]);

                if (typedUsername === username && typedPassword === password) {
                    break;
                }
            }

            await frame.click('#myvne_button_login');
        };
    }
}
