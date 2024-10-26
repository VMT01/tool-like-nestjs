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
    private _accountPath = path.resolve(process.cwd(), 'accounts', 'vnexpress');

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
        }: VnExpressLikeQuery,
        body: string,
    ) {
        const accounts = readUserPass(this._accountPath);
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

        let i: number;
        let data: { like: number; comment: number; vote: number } = { like: 0, comment: 0, vote: 0 };
        let totalAccountUsed = 0;
        let totalLikeSuccess = 0;

        const stateFilePath = 'state.json';
        if (!continueChunk || !fs.existsSync(stateFilePath)) {
            i = 0;
        } else {
            data = JSON.parse(fs.readFileSync(stateFilePath, 'utf-8'));
            i = data.like + 1;
        }
        for (; i < accountChunk.length; i++) {
            data.like = i;
            fs.writeFileSync('state.json', JSON.stringify(data));

            console.log(`[VNExpress] Running at chunk ${i + 1} / ${accountChunk.length}`);
            const promises = accountChunk[i].map((account, idx) =>
                this._handleLikeVnex(
                    ppts[idx],
                    url,
                    account,
                    i * browserNum + idx,
                    vnExComments,
                    proxyServer && { proxyServer, proxyUsername, proxyPassword },
                    likeLimit,
                ),
            );
            const result = await Promise.all(promises);
            for (const r of result) {
                for (let j = 0; j < vnExComments.length; j++) {
                    if (!r) {
                        results[j].accountUsed++;
                        totalAccountUsed++;
                        continue;
                    }
                    if (r.results[j].flag) {
                        results[j].accountUsed++;
                        totalAccountUsed++;
                    } else {
                        results[j].liked = r.results[j].liked;
                        totalLikeSuccess++;
                    }
                    breakFlag = breakFlag || r.breakFlag;
                }
            }

            console.log(`${totalLikeSuccess} like success/${totalAccountUsed} account used`);
            if (breakFlag) break;
        }
        const totalSuccess = results.reduce((acc, cur) => acc + cur.liked, 0);
        return { totalSuccess, results };
    }

    private async _fetchVnExComments(url: string, body: string) {
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
            throw new Error(err);
        }
    }

    private async _handleLikeVnex(
        ppt: PuppeteerHelper,
        url: string,
        profile: { user: string; pass: string },
        profileIndex: number,
        comments: VNExDataItem[],
        proxy?: Proxy,
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
            loginSuccess = await retry(
                async () => {
                    try {
                        await ppt.startLoginBrowser(proxy);
                        await ppt.runOnLoginBrowser(
                            this.__redirect(url, 'section.section.page-detail.middle-detail', proxy && 10 * 60 * 1000),
                        );
                        await ppt.runOnLoginBrowser(this.__autoScroll());
                        await ppt.runOnLoginBrowser(
                            this.__login(profile, profileIndex, EMethod.LIKE, proxy && 2 * 60 * 1000),
                        );
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

        if (loginSuccess === undefined) return undefined;

        const cookies = fs.readFileSync(cookiesPath, { encoding: 'utf-8' });
        const result = await retry(
            async () => {
                try {
                    await ppt.startNormalBrowser(proxy);
                    await ppt.runOnNormalBrowser(
                        this.__setCookiesAndRedirect(
                            url,
                            'section.section.page-detail.middle-detail',
                            JSON.parse(cookies),
                            proxy && 6 * 60 * 1000,
                        ),
                    );
                    await ppt.runOnNormalBrowser(this.__autoScroll());
                    await ppt.runOnNormalBrowser(this.__loadmoreComments(proxy && 6 * 60 * 1000));
                    return await ppt.runOnNormalBrowser(this.__like(comments, likeLimit, proxy && 6 * 60 * 1000));
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

    private __redirect(url: string, selector: string, timeout = 3 * 60 * 1000) {
        return async function (page: PageWithCursor) {
            await Promise.race([
                page.goto(url, { waitUntil: 'load' }),
                page.waitForSelector(selector, { timeout }),
            ]).catch(_ => {});
        };
    }

    private __setCookiesAndRedirect(url: string, selector: string, cookies: Cookie[], timeout = 3 * 60 * 1000) {
        return async function (page: Page) {
            await page.setCookie(...cookies);

            await Promise.race([
                page.goto(url, { waitUntil: 'load' }),
                page.waitForSelector(selector, { timeout }),
            ]).catch(_ => {});
        };
    }

    private __login(
        { user, pass }: { user: string; pass: string },
        profileIndex: number,
        method: EMethod,
        timeout = 30 * 1000,
    ) {
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
                page.waitForNavigation({ timeout }),
            ]).catch(_ => {});
            const _ = await page.$('.log_txt');
            if (!!_) throw new Error('Login failed!');
            await sleep(5000);

            // Login success, saving cookies for later
            const cookies = await page.cookies();
            fs.writeFileSync(cookiesPath, JSON.stringify(cookies, null, 2));
        };
    }

    private __autoScroll(maxScrolls = 50) {
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

    private __loadmoreComments(timeout = 3 * 60 * 1000) {
        return async function (page: Page) {
            let _: ElementHandle<Element>;
            while ((_ = await page.$('#show_more_coment'))) {
                await Promise.all([
                    page.click('#show_more_coment'),
                    page.waitForSelector('#show_more_coment', { timeout }),
                ]);
                await sleep();
            }
        };
    }

    private __like(comments: VNExDataItem[], likeLimit?: number, timeout = 3 * 60 * 1000) {
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
                    results.push({ flag: false, liked });
                    continue;
                }

                await Promise.all([
                    page.$eval(`a[id="${comment_id}"]`, e => e.click()),
                    page.waitForResponse(
                        r => r.url() === 'https://usi-saas.vnexpress.net/post/cmt/like' && r.status() === 200,
                        { timeout },
                    ),
                ]);

                const noti = await page.$('.mfp-close');
                if (noti) {
                    await page.click('.mfp-close');
                    results.push({ flag: false, liked }); // Since we cannot do anything here
                } else {
                    results.push({ flag: true, liked });
                    await sleep();
                }

                await sleep();
            }

            return { results, breakFlag };
        };
    }

    async commentVnex(
        { url, browserNum, isVisual, proxyServer, proxyUsername, proxyPassword, continueChunk }: VnExpressCommentQuery,
        body: string,
    ) {
        const accounts = readUserPass(this._accountPath);
        const comments = body
            .split('\n')
            .map(c => c.trim())
            .filter(c => c.length > 0);

        // Init puppeteer instances
        const ppts = Array.from({ length: browserNum }, () => new PuppeteerHelper(!isVisual));

        // Init results
        const results: { comment: string; success: boolean }[] = [];

        const commentChunk = chunking(comments, browserNum);
        let i: number;
        let data: { like: number; comment: number; vote: number } = { like: 0, comment: 0, vote: 0 };
        let totalCommentSuccess = 0;
        let totalAccountUsed = 0;

        const stateFilePath = 'state.json';
        if (!continueChunk || fs.existsSync(stateFilePath)) {
            i = 0;
        } else {
            data = JSON.parse(fs.readFileSync(stateFilePath, 'utf-8'));
            i = data.comment < commentChunk.length ? data.comment : 0;
        }
        for (; i < commentChunk.length; i++) {
            console.log(`[VNExpress] Running at chunk ${i + 1} / ${commentChunk.length}`);
            data.comment = i;
            fs.writeFileSync('state.json', JSON.stringify(data));

            const promises = commentChunk[i].map((comment, idx) =>
                this._handleCommentVnex(
                    ppts[idx],
                    url,
                    accounts[i * browserNum + idx],
                    i * browserNum + idx,
                    comment,
                    proxyServer && { proxyServer, proxyUsername, proxyPassword },
                ),
            );
            const result = await Promise.all(promises);
            result.forEach((r, idx) => {
                totalCommentSuccess += !!r ? 1 : 0;
                totalAccountUsed++;
                results.push({
                    comment: commentChunk[i][idx],
                    success: !!r,
                });
            });
            console.log(`${totalCommentSuccess} comment success/${totalAccountUsed} account used`);
        }
        return results;
    }

    private async _handleCommentVnex(
        ppt: PuppeteerHelper,
        url: string,
        profile: { user: string; pass: string },
        profileIndex: number,
        comment: string,
        proxy?: Proxy,
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
            loginSuccess = await retry(
                async () => {
                    try {
                        await ppt.startLoginBrowser(proxy);
                        await ppt.runOnLoginBrowser(
                            this.__redirect(url, 'section.section.page-detail.middle-detail', proxy && 10 * 60 * 1000),
                        );
                        await ppt.runOnLoginBrowser(this.__autoScroll());
                        await ppt.runOnLoginBrowser(
                            this.__login(profile, profileIndex, EMethod.COMMENT, proxy && 2 * 60 * 1000),
                        );
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

        if (loginSuccess === undefined) return undefined;

        const cookies = fs.readFileSync(cookiesPath, { encoding: 'utf-8' });
        const result = await retry(
            async () => {
                try {
                    await ppt.startNormalBrowser(proxy);
                    await ppt.runOnNormalBrowser(
                        this.__setCookiesAndRedirect(
                            url,
                            'section.section.page-detail.middle-detail',
                            JSON.parse(cookies),
                            proxy && 6 * 60 * 1000,
                        ),
                    );
                    await ppt.runOnNormalBrowser(this.__autoScroll());
                    return await ppt.runOnNormalBrowser(this.__comment(comment, proxy && 6 * 60 * 1000));
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

    private __comment(comment: string, timeout = 3 * 60 * 1000) {
        return async function (page: Page) {
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

            await Promise.all([
                page.click('#comment_post_button'),
                page.waitForResponse(
                    r => r.url() === 'https://usi-saas.vnexpress.net/index/add/v2' && r.status() === 200,
                    { timeout },
                ),
            ]);
            await sleep();

            return true;
        };
    }

    async voteVnex(
        { url, browserNum, isVisual, proxyServer, proxyUsername, proxyPassword, continueChunk }: VnExpressVoteQuery,
        body: string,
    ) {
        const accounts = readUserPass(this._accountPath);
        const options = body
            .trim()
            .split(',')
            .map(o => Number(o.trim()));

        // Init puppeteer instances
        const ppts = Array.from({ length: browserNum }, () => new PuppeteerHelper(!isVisual));

        // Init results
        let results = 0;

        const accountChunk = chunking(accounts, browserNum);
        let i: number;
        let data: { like: number; comment: number; vote: number } = { like: 0, comment: 0, vote: 0 };
        let totalAccountUsed = 0;

        const stateFilePath = 'state.json';
        if (!continueChunk || fs.existsSync(stateFilePath)) {
            i = 0;
        } else {
            data = JSON.parse(fs.readFileSync(stateFilePath, 'utf-8'));
            i = data.vote < accountChunk.length ? data.vote : 0;
        }

        for (; i < accountChunk.length; i++) {
            console.log(`[VNExpress] Running at chunk ${i + 1} / ${accountChunk.length}`);
            data.vote = i;
            fs.writeFileSync('state.json', JSON.stringify(data));

            const promises = accountChunk[i].map(async (profile, idx) =>
                this._handleVoteVnex(
                    ppts[idx],
                    url,
                    profile,
                    i * browserNum + idx,
                    options,
                    proxyServer && { proxyServer, proxyUsername, proxyPassword },
                ),
            );
            const result = await Promise.all(promises);
            result.forEach(r => {
                results += r ? 1 : 0;
                totalAccountUsed++;
            });

            console.log(`${results} vote success/${totalAccountUsed} account used`);
        }
        return 'Success vote accounts: ' + results;
    }

    private async _handleVoteVnex(
        ppt: PuppeteerHelper,
        url: string,
        profile: { user: string; pass: string },
        profileIndex: number,
        options: number[],
        proxy?: Proxy,
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
            loginSuccess = await retry(
                async () => {
                    try {
                        await ppt.startLoginBrowser(proxy);
                        await ppt.runOnLoginBrowser(
                            this.__redirect(url, 'section.section.page-detail.middle-detail', proxy && 10 * 60 * 1000),
                        );
                        await ppt.runOnLoginBrowser(this.__autoScroll());
                        await ppt.runOnLoginBrowser(
                            this.__login(profile, profileIndex, EMethod.VOTE, proxy && 2 * 60 * 1000),
                        );
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

        if (loginSuccess === undefined) return undefined;

        const cookies = fs.readFileSync(cookiesPath, { encoding: 'utf-8' });
        const result = await retry(
            async () => {
                try {
                    await ppt.startNormalBrowser(proxy);
                    await ppt.runOnNormalBrowser(
                        this.__setCookiesAndRedirect(
                            url,
                            'section.section.page-detail.middle-detail',
                            JSON.parse(cookies),
                            proxy && 6 * 60 * 1000,
                        ),
                    );
                    await ppt.runOnNormalBrowser(this.__autoScroll());
                    return await ppt.runOnNormalBrowser(this.__vote(options, proxy && 6 * 60 * 1000));
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

    private __vote(options: number[], timeout = 3 * 60 * 1000) {
        return async function (page: Page) {
            await page.$eval(`div[id="boxthamdoykien"]`, el =>
                el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' }),
            );
            await sleep();

            const opts = await page.$$('.content_box_category > div.item_row_bx');
            if (opts.length === 0) return true; // Voted

            for (const optIdx of options) {
                await opts[optIdx - 1].click();
                await sleep();
            }

            await sleep(5000);
            await Promise.all([
                page.click(`#btn_add_vote_53360`),
                page.waitForResponse(r => r.url() === 'https://usi-saas.vnexpress.net/vote/insertvote', { timeout }),
                page.waitForResponse(r => r.url() === 'https://usi-saas.vnexpress.net/api/cf', { timeout }),
            ]);
            await sleep();

            return true;
        };
    }
}
