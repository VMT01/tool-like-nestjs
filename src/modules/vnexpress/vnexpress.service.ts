import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { Cookie, ElementHandle, Page } from 'puppeteer';
import { PageWithCursor } from 'puppeteer-real-browser';

import { Injectable } from '@nestjs/common';

import { EMethod } from '@constants/service-kind.constant';

import { chunking } from '@shared/helpers/array.helper';
import { readUserPass } from '@shared/helpers/profile.helper';
import { retry, sleep } from '@shared/helpers/promise.helper';
import { Proxy, PuppeteerHelper } from '@shared/helpers/puppeteer.helper';

import { VnExpressCommentQuery } from './dtos/request-comment.dto';
import { VnExpressLikeQuery } from './dtos/request-like.dto';
import { VnExpressVoteQuery } from './dtos/request-vote.dto';
import { VNExDataItem, VNExResponse } from './vnexpress.type';

@Injectable()
export class VnExpressService {
    constructor() {}

    async likeVnex(
        {
            url,
            browserNum,
            likeLimit,
            isVisual,
            proxyServer,
            proxyUsername,
            proxyPassword,
            continueChunk,
            accountPath,
        }: VnExpressLikeQuery,
        body: string,
    ) {
        const accounts = readUserPass(accountPath).slice(0, 3);
        const vnExComments = await this._fetchVnExComments(url, body);

        // Init puppeteer instances
        const ppts = Array.from({ length: browserNum }, () => new PuppeteerHelper(!isVisual));

        // Init results
        const results = vnExComments.map(v => ({
            comment: v.content,
            like: v.userlike,
            accountUsed: 0,
            liked: 0,
        }));

        const accountChunk = chunking(accounts, browserNum);
        let breakFlag = false;
        for (let i = 0; i < accountChunk.length; i++) {
            console.log(`[VNExpress] Running at chunk ${i + 1} / ${accountChunk.length}`);
            const promises = accountChunk[i].map((account, idx) =>
                this._handleLikeVnex(
                    `Browser #${idx}`,
                    ppts[idx],
                    proxyServer && { proxyServer, proxyUsername, proxyPassword },
                    url,
                    account,
                    i * browserNum + idx,
                    vnExComments,
                    likeLimit,
                ),
            );
            const result = await Promise.all(promises);
            for (const r of result) {
                for (let j = 0; j < vnExComments.length; j++) {
                    if (!r) {
                        results[j].accountUsed++;
                        continue;
                    }
                    if (r.results[j].flag) results[j].accountUsed++;
                    else results[j].liked = r.results[j].liked;
                    breakFlag = breakFlag || r.breakFlag;
                }
            }
            if (breakFlag) break;
        }
        const totalSuccess = results.reduce((acc, cur) => acc + cur.liked, 0);
        return { totalSuccess, results };
    }

    private async _fetchVnExComments(url: string, body: string) {
        console.log('[VNExpressService] Fetching VNExpress comments');

        const comments = body
            .split('\n')
            .map(c => c.trim())
            .filter(c => c.length > 0);
        const id = url.split('.')[1].split('-').at(-1);
        const commentPromises = Array.from({ length: 3 }, (_, v) => v + 1).map(v =>
            axios.get<VNExResponse>(`https://usi-saas.vnexpress.net/index/get`, {
                params: {
                    objectid: id,
                    objecttype: v,
                    siteid: 1000000,
                    offset: 0,
                    limit: 500,
                },
            }),
        );

        try {
            const response = await Promise.all(commentPromises);
            const data = response.map(r => r.data);

            const vnExComments: VNExDataItem[] = data
                .reduce((acc, v) => acc.concat(v.data.items), [])
                .filter(comment => !!comments.find(c => comment.content.includes(c)));
            if (vnExComments.length === 0) throw new Error('Danh sách bình luận không trùng khớp từ vnexpress');

            return vnExComments;
        } catch (err) {
            console.log('[VNExpressService - ERROR]', err.message);
            throw new Error(err);
        }
    }

    private async _handleLikeVnex(
        id: string,
        ppt: PuppeteerHelper,
        proxy: Proxy,
        url: string,
        profile: { user: string; pass: string },
        profileIndex: number,
        comments: VNExDataItem[],
        likeLimit?: number,
    ) {
        const cookiesPath = path.resolve(
            process.cwd(),
            'accounts',
            'puppeteer',
            'vnexpress',
            EMethod.LIKE,
            `(${profileIndex}).json`,
        );
        let loginSuccess: boolean | undefined = false;
        if (!fs.existsSync(cookiesPath)) {
            id = `${id} - Bypass CloudFlare`;
            console.log(`[${id}] Cookies not found. Logging in...`);
            loginSuccess = await retry(
                id,
                async () => {
                    try {
                        await ppt.startLoginBrowser();
                        await ppt.runOnLoginBrowser(
                            this.__redirect(id, url, 'section.section.page-detail.middle-detail'),
                        );
                        await ppt.runOnLoginBrowser(this.__autoScroll(id));
                        await ppt.runOnLoginBrowser(this.__login(id, profile, profileIndex, EMethod.LIKE));
                        await sleep(5000);
                        return true;
                    } catch (error) {
                        throw new Error(error);
                    } finally {
                        await ppt.stopLoginBrownser();
                    }
                },
                () => true,
            );
        }

        if (loginSuccess === undefined) {
            console.log(`[${id}] Login failed.`);
            return undefined;
        }

        id = `${id} - Normal`;
        const cookies = fs.readFileSync(cookiesPath, { encoding: 'utf-8' });
        const result = await retry(
            id,
            async () => {
                try {
                    await ppt.startNormalBrowser();
                    await ppt.runOnNormalBrowser(
                        this.__setCookiesAndRedirect(
                            id,
                            url,
                            'section.section.page-detail.middle-detail',
                            JSON.parse(cookies),
                        ),
                    );
                    await ppt.runOnNormalBrowser(this.__autoScroll(id));
                    await ppt.runOnNormalBrowser(this.__loadmoreComments(id));
                    return await ppt.runOnNormalBrowser(this.__like(id, comments, likeLimit));
                } catch (error) {
                    throw new Error(error);
                } finally {
                    await ppt.stopNormalBrowser();
                }
            },
            () => true,
        );
        return result;
    }

    private __redirect(id: string, url: string, selector: string) {
        console.log(`[${id}] Redirecting to:`, url);

        return async function (page: PageWithCursor) {
            await Promise.race([
                page.goto(url, { waitUntil: 'load' }),
                page.waitForSelector(selector, { timeout: 3 * 60 * 1000 }),
            ]).catch(_ => console.log(`[${id} - ERROR] Timeout -> IGNORE`));
        };
    }

    private __setCookiesAndRedirect(id: string, url: string, selector: string, cookies: Cookie[]) {
        return async function (page: Page) {
            console.log(`[${id}] Found cookies! Setting cookies...`);
            await page.setCookie(...cookies);

            console.log(`[${id}] Redirecting to:`, url);
            await Promise.race([
                page.goto(url, { waitUntil: 'load' }),
                page.waitForSelector(selector, { timeout: 3 * 60 * 1000 }),
            ]).catch(_ => console.log(`[${id} - ERROR] Timeout -> IGNORE`));
        };
    }

    private __login(id: string, { user, pass }: { user: string; pass: string }, profileIndex: number, method: EMethod) {
        console.log(`[${id}] Logging in...`);
        const cookiesPath = path.resolve(
            process.cwd(),
            'accounts',
            'puppeteer',
            'vnexpress',
            method.toString(),
            `(${profileIndex}).json`,
        );

        return async function (page: PageWithCursor) {
            await Promise.all([
                page.click('.log_txt'),
                page.waitForResponse(res =>
                    res.url().startsWith('https://my.vnexpress.net/authen/users/login?refer=authen'),
                ),
                page.waitForFrame(fr =>
                    fr.url().startsWith('https://my.vnexpress.net/authen/users/login?refer=authen'),
                ),
            ]);
            await sleep(5000);

            // Enter username & password
            await page.evaluate(
                ({ user, pass }) => {
                    const iframe: any = document.querySelector('.mfp-iframe');
                    const innerDoc = iframe.contentDocument || iframe.contentWindow.document;
                    let userInput: any;
                    for (let i = 0; i < 5; i++) {
                        userInput = innerDoc.querySelector('#myvne_email_input');
                        // userInput = iframe.querySelector('#myvne_email_input');
                        if (userInput) {
                            userInput.value = user;
                            break;
                        }
                    }
                    let passInput: any;
                    for (let i = 0; i < 5; i++) {
                        passInput = innerDoc.querySelector('#myvne_password_input');
                        // passInput = iframe.querySelector('#myvne_password_input');
                        if (passInput) {
                            passInput.value = pass;
                            break;
                        }
                    }
                },
                { user, pass },
            );
            await sleep(2000);

            // Submit account
            await Promise.all([
                page.evaluate(() => {
                    const iframe: any = document.querySelector('.mfp-iframe');
                    const innerDoc = iframe.contentDocument || iframe.contentWindow.document;
                    let loginButton: any;
                    for (let i = 0; i < 5; i++) {
                        loginButton = innerDoc.querySelector('#myvne_button_login');
                        // loginButton = iframe.querySelector('#myvne_button_login');
                        if (loginButton) {
                            loginButton.click();
                            break;
                        }
                    }
                }),
                page.waitForNavigation(),
            ]).catch(_ => {});
            const _ = await page.$('.log_txt');
            if (!!_) throw new Error('Login failed!');
            await sleep(5000);
            // Login success, saving cookies for later
            console.log(`[${id}] Saving cookies for profile #${profileIndex} at path: ${cookiesPath}`);
            const cookies = await page.cookies();
            fs.writeFileSync(cookiesPath, JSON.stringify(cookies, null, 2));
        };
    }

    private __autoScroll(id: string, maxScrolls = 50) {
        console.log(`[${id}] Auto scrolling...`);

        return async function (page: any) {
            let totalHeight = 0;
            let scrolls = 0;

            while (true) {
                const distance = Math.floor(Math.random() * 350 + 50);
                totalHeight += distance;
                const shouldBreak = await page.evaluate(
                    (distance: number, totalHeight: number) => {
                        window.scrollBy({ top: distance, behavior: 'smooth' });
                        return totalHeight >= document.body.scrollHeight - window.innerHeight;
                    },
                    distance,
                    totalHeight,
                );
                if (shouldBreak || ++scrolls >= maxScrolls) break;
                await sleep(Math.floor(Math.random() * 4000 + 1000));
            }
        };
    }

    private __loadmoreComments(id: string) {
        console.log(`[${id}] Loading more...`);

        return async function (page: Page) {
            let _: ElementHandle<Element>;
            while ((_ = await page.$('#show_more_coment'))) {
                await Promise.all([
                    page.click('#show_more_coment'),
                    page.waitForSelector('#show_more_coment', { timeout: 3 * 60 * 1000 }),
                ]);
                await sleep();
            }
        };
    }

    private __like(id: string, comments: VNExDataItem[], likeLimit?: number) {
        console.log(`[${id}] Liking comments...`);

        let breakFlag = false;
        const results: { flag: boolean; liked: number }[] = [];

        return async function (page: Page) {
            for (const { comment_id, userlike } of comments) {
                // Scroll to view;
                await page.$eval(`a[id="${comment_id}"]`, el =>
                    el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' }),
                );
                await sleep();

                // Skip if current like exceed like limit
                const currentLike = await page.$eval(`div.reactions-total[rel="${comment_id}"]`, el =>
                    Number(el.innerText.split('.').join('')),
                );
                const liked = currentLike - userlike;
                if (likeLimit !== undefined && liked >= likeLimit) {
                    console.log(`[${id}] Skip ${comment_id} since exceeded like limit`);
                    breakFlag = true;
                    results.push({ flag: false, liked });
                    continue;
                }
                breakFlag = false;

                const buttonAttr = await page.$eval(`a[id="${comment_id}"]`, el => {
                    if (!el) return undefined;
                    return el.getAttribute('data-name');
                });
                // Skip if liked
                if (buttonAttr && buttonAttr === 'like') {
                    console.log(`[${id}] Skip ${comment_id} since liked`);
                    results.push({ flag: false, liked });
                    continue;
                }

                await Promise.all([
                    page.$eval(`a[id="${comment_id}"]`, e => e.click()),
                    page.waitForResponse(
                        r => r.url() === 'https://usi-saas.vnexpress.net/post/cmt/like' && r.status() === 200,
                        { timeout: 3 * 60 * 1000 },
                    ),
                ]);

                const noti = await page.$('.mfp-close');
                if (noti) {
                    console.log(`[${id}] Closing block noti...`);
                    await page.click('.mfp-close');
                    results.push({ flag: false, liked }); // Since we cannot do anything here
                } else {
                    console.log(`[${id}] ${comment_id} like success`);
                    results.push({ flag: true, liked });
                    await sleep();
                }
            }

            return { results, breakFlag };
        };
    }

    async commentVnex(
        {
            url,
            browserNum,
            isVisual,
            proxyServer,
            proxyUsername,
            proxyPassword,
            accountPath,
            continueChunk,
        }: VnExpressCommentQuery,
        body: string,
    ) {
        const accounts = readUserPass(accountPath).slice(0, 3);
        const comments = body
            .split('\n')
            .map(c => c.trim())
            .filter(c => c.length > 0);

        // Init puppeteer instances
        const ppts = Array.from({ length: browserNum }, () => new PuppeteerHelper(!isVisual));

        // Init results
        const results: { comment: string; success: boolean }[] = [];

        const commentChunk = chunking(comments, browserNum);
        for (let i = 0; i < commentChunk.length; i++) {
            console.log(`[VNExpress] Running at chunk ${i + 1} / ${commentChunk.length}`);

            const promises = commentChunk[i].map((comment, idx) =>
                this._handleCommentVnex(
                    `Browser #${idx}`,
                    ppts[idx],
                    proxyServer && { proxyServer, proxyUsername, proxyPassword },
                    url,
                    accounts[i * browserNum + idx],
                    i * browserNum + idx,
                    comment,
                ),
            );
            const result = await Promise.all(promises);
            result.forEach((r, idx) =>
                results.push({
                    comment: commentChunk[i][idx],
                    success: !!r,
                }),
            );
        }
        return results;
    }

    private async _handleCommentVnex(
        id: string,
        ppt: PuppeteerHelper,
        proxy: Proxy,
        url: string,
        profile: { user: string; pass: string },
        profileIndex: number,
        comment: string,
    ) {
        const cookiesPath = path.resolve(
            process.cwd(),
            'accounts',
            'puppeteer',
            'vnexpress',
            EMethod.COMMENT,
            `(${profileIndex}).json`,
        );
        let loginSuccess: boolean | undefined = false;
        if (!fs.existsSync(cookiesPath)) {
            id = `${id} - Bypass CloudFlare`;
            console.log(`[${id}] Cookies not found. Logging in...`);
            loginSuccess = await retry(
                id,
                async () => {
                    try {
                        await ppt.startLoginBrowser();
                        await ppt.runOnLoginBrowser(
                            this.__redirect(id, url, 'section.section.page-detail.middle-detail'),
                        );
                        await ppt.runOnLoginBrowser(this.__autoScroll(id));
                        await ppt.runOnLoginBrowser(this.__login(id, profile, profileIndex, EMethod.COMMENT));
                        await sleep(5000);
                        return true;
                    } catch (error) {
                        throw new Error(error);
                    } finally {
                        await ppt.stopLoginBrownser();
                    }
                },
                () => true,
            );
        }

        if (loginSuccess === undefined) {
            console.log(`[${id}] Login failed.`);
            return undefined;
        }

        id = `${id} - Normal`;
        const cookies = fs.readFileSync(cookiesPath, { encoding: 'utf-8' });
        const result = await retry(
            id,
            async () => {
                try {
                    await ppt.startNormalBrowser();
                    await ppt.runOnNormalBrowser(
                        this.__setCookiesAndRedirect(
                            id,
                            url,
                            'section.section.page-detail.middle-detail',
                            JSON.parse(cookies),
                        ),
                    );
                    await ppt.runOnNormalBrowser(this.__autoScroll(id));
                    return await ppt.runOnNormalBrowser(this.__comment(id, comment));
                } catch (error) {
                    throw new Error(error);
                } finally {
                    await ppt.stopNormalBrowser();
                }
            },
            () => true,
        );
        return result;
    }

    private __comment(id: string, comment: string) {
        return async function (page: Page) {
            console.log(`[${id}] Typing comment...`);
            while (true) {
                await page.$eval('#txtComment', el =>
                    el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' }),
                );
                await page.click('#txtComment', { count: 3 });
                await page.type('#txtComment', comment, { delay: 100 });
                const commentTyped = await page.$eval(
                    '#txtComment',
                    (el, comment) => {
                        const message = (<HTMLTextAreaElement>el).value;
                        if (message === comment) return true;
                        return false;
                    },
                    comment,
                );
                if (commentTyped) break;
            }
            await sleep();

            console.log(`[${id}] Click submit comment`);
            await Promise.all([
                page.click('#comment_post_button'),
                page.waitForResponse(
                    r => r.url() === 'https://usi-saas.vnexpress.net/index/add/v2' && r.status() === 200,
                ),
            ]);
            await sleep();

            return true;
        };
    }

    async voteVnex(
        {
            url,
            browserNum,
            isVisual,
            proxyServer,
            proxyUsername,
            proxyPassword,
            accountPath,
            continueChunk,
        }: VnExpressVoteQuery,
        body: string,
    ) {
        const accounts = readUserPass(accountPath).slice(0, 3);
        const options = body
            .trim()
            .split(',')
            .map(o => Number(o.trim()));

        // Init puppeteer instances
        const ppts = Array.from({ length: browserNum }, () => new PuppeteerHelper(!isVisual));

        // Init results
        let results = 0;

        const accountChunk = chunking(accounts, browserNum);
        for (let i = 0; i < accountChunk.length; i++) {
            console.log(`[VNExpress] Running at chunk ${i + 1} / ${accountChunk.length}`);
            const promises = accountChunk[i].map(async (profile, idx) =>
                this._handleVoteVnex(
                    `Browser #${idx}`,
                    ppts[idx],
                    proxyServer && { proxyServer, proxyUsername, proxyPassword },
                    url,
                    profile,
                    i * browserNum + idx,
                    options,
                ),
            );
            const result = await Promise.all(promises);
            result.forEach(r => (results += r ? 1 : 0));
        }
        return 'Success vote accounts: ' + results;
    }

    private async _handleVoteVnex(
        id: string,
        ppt: PuppeteerHelper,
        proxy: Proxy,
        url: string,
        profile: { user: string; pass: string },
        profileIndex: number,
        options: number[],
    ) {
        const cookiesPath = path.resolve(
            process.cwd(),
            'accounts',
            'puppeteer',
            'vnexpress',
            EMethod.VOTE,
            `(${profileIndex}).json`,
        );
        let loginSuccess: boolean | undefined = false;
        if (!fs.existsSync(cookiesPath)) {
            id = `${id} - Bypass CloudFlare`;
            console.log(`[${id}] Cookies not found. Logging in...`);
            loginSuccess = await retry(
                id,
                async () => {
                    try {
                        await ppt.startLoginBrowser();
                        await ppt.runOnLoginBrowser(
                            this.__redirect(id, url, 'section.section.page-detail.middle-detail'),
                        );
                        await ppt.runOnLoginBrowser(this.__autoScroll(id));
                        await ppt.runOnLoginBrowser(this.__login(id, profile, profileIndex, EMethod.VOTE));
                        await sleep(5000);
                        return true;
                    } catch (error) {
                        throw new Error(error);
                    } finally {
                        await ppt.stopLoginBrownser();
                    }
                },
                () => true,
            );
        }

        if (loginSuccess === undefined) {
            console.log(`[${id}] Login failed.`);
            return undefined;
        }

        id = `${id} - Normal`;
        const cookies = fs.readFileSync(cookiesPath, { encoding: 'utf-8' });
        const result = await retry(
            id,
            async () => {
                try {
                    await ppt.startNormalBrowser();
                    await ppt.runOnNormalBrowser(
                        this.__setCookiesAndRedirect(
                            id,
                            url,
                            'section.section.page-detail.middle-detail',
                            JSON.parse(cookies),
                        ),
                    );
                    await ppt.runOnNormalBrowser(this.__autoScroll(id));
                    return await ppt.runOnNormalBrowser(this.__vote(id, options));
                    // await ppt.runOnNormalBrowser(this.__loadmoreComments(id));
                    // return await ppt.runOnNormalBrowser(this.__like(id, comments, likeLimit));
                } catch (error) {
                    throw new Error(error);
                } finally {
                    await ppt.stopNormalBrowser();
                }
            },
            () => true,
        );
        return result;
    }

    private __vote(id: string, options: number[]) {
        return async function (page: Page) {
            console.log(`[${id}] Select options...`);
            await page.$eval(`div[id="boxthamdoykien"]`, el =>
                el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' }),
            );
            await sleep();

            const opts = await page.$$('.content_box_category > div.item_row_bx');
            for (const optIdx of options) {
                await opts[optIdx - 1].click();
                await sleep();
            }

            console.log(`[${id}] Submiting vote...`);
            await sleep(5000);
            await Promise.all([
                page.click(`#btn_add_vote_53360`),
                page.waitForResponse(r => r.url() === 'https://usi-saas.vnexpress.net/vote/insertvote'),
                page.waitForResponse(r => r.url() === 'https://usi-saas.vnexpress.net/api/cf'),
            ]);
            await sleep();

            return true;
        };
    }
}
