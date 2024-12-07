import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { Cookie, Page } from 'puppeteer';
import { PageWithCursor } from 'puppeteer-real-browser';

import { Injectable } from '@nestjs/common';

import { EMethod } from '@constants/service-kind.constant';

import { chunking } from '@shared/helpers/array.helper';
import { createLogger } from '@shared/helpers/logger.helper';
import { readUserPass } from '@shared/helpers/profile.helper';
import { retry, sleep } from '@shared/helpers/promise.helper';
import { PuppeteerHelper } from '@shared/helpers/puppeteer.helper';

import { VnExpressCommentQuery } from './dtos/request-comment.dto';
import { VnExpressLikeQuery } from './dtos/request-like.dto';
import { VnExpressVoteQuery } from './dtos/request-vote.dto';
import { VnExpressQuery } from './dtos/request.dto';
import { VNExDataItem, VNExResponse } from './vnexpress.type';

@Injectable()
export class VnExpressService {
    private readonly _accountPath = path.resolve(process.cwd(), 'accounts', 'vnexpress');
    private readonly _logger = createLogger();

    constructor() {}

    async likeVnex(
        { url, browserNum, likeLimit, isVisual, resetProxy, continueChunk }: VnExpressLikeQuery,
        body: string,
    ) {
        const accounts = readUserPass(this._accountPath, EMethod.LIKE);
        const vnExComments = await this._fetchVnExComments(url, body);

        // Init puppeteer instances
        const ppts = Array.from({ length: browserNum }, () => new PuppeteerHelper(!isVisual, resetProxy));

        // Init results
        const results = vnExComments.map(v => ({
            comment: v.content,
            like: v.userlike,
            accountUsed: 0,
            liked: 0,
        }));

        // Init iterator
        const accountChunk = chunking(accounts, browserNum);

        let i = 0;
        const data: { like: number; comment: number; vote: number } = { like: 0, comment: 0, vote: 0 };
        const stateFilePath = 'state.json';
        if (continueChunk && fs.existsSync(stateFilePath)) {
            const data = JSON.parse(fs.readFileSync(stateFilePath, 'utf-8'));
            i = data.like < accountChunk.length ? data.like : 0;
        }
        for (; i < accountChunk.length; i++) {
            data.like = i;
            fs.writeFileSync('state.json', JSON.stringify(data));
            this._logger.service.log(`Đang sử dụng bộ account ${i * browserNum + 1} - ${(i + 1) * browserNum}`);

            const promises = accountChunk[i].map((account, idx) =>
                this._handleLikeVnex(
                    `Browser #${idx}`,
                    ppts[idx],
                    url,
                    { ...account, index: i * browserNum + idx },
                    vnExComments,
                    likeLimit,
                ),
            );
            const resultChunk = await Promise.all(promises);
            this._logger.service.log(JSON.stringify(resultChunk, null, 2));

            // Calculate result for each comment
            let totalLiked = 0;
            let totalMissing = 0;
            let breakFlag = true;
            for (let j = 0; j < vnExComments.length; j++) {
                let missingMin = Infinity;
                for (const result of resultChunk) {
                    if (!result) {
                        results[j].accountUsed++;
                        continue;
                    }
                    if (result.results[j].likedFlag) results[j].accountUsed++;
                    else {
                        results[j].liked = result.results[j].liked;
                        totalLiked += result.results[j].liked;
                    }
                    breakFlag = breakFlag && result.breakFlag;
                    missingMin = Math.min(missingMin, result.results[j].missing);
                }
                totalMissing += missingMin;
            }

            this._logger.service.log(
                `${totalLiked} likes / ${i * browserNum + accountChunk[i].length} accounts used (missing ${totalMissing} likes)`,
            );
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
        this._logger.service.log(`Cần thực hiện like ${comments.length} comment`);

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
            this._logger.service.log('Đang tải bộ comment...');
            const response = await Promise.all(commentPromises);
            const data = response.flatMap(r => r.data.data.items);
            this._logger.service.log(`Đã tìm thấy ${data.length} comment từ VNExpress`);

            const commentNotFound: string[] = [];
            const vnExComments: VNExDataItem[] = [];
            for (const comment of comments) {
                const item = data.find(c => c.content.trim() === comment);
                if (!item) commentNotFound.push(comment);
                else vnExComments.push(item);
            }

            this._logger.service.log(`Đã tìm thấy ${vnExComments.length} comment trùng khớp`);
            if (commentNotFound.length !== 0) {
                this._logger.service.error(
                    `Có ${commentNotFound.length} comment không tìm thấy trong bộ như sau:\n${JSON.stringify(commentNotFound, null, 2)}`,
                );
            }

            if (vnExComments.length === 0) {
                throw new Error('Danh sách comment cần like là 0');
            }

            return vnExComments;
        } catch (err) {
            throw new Error(err);
        }
    }

    private async _handleLikeVnex(
        id: string,
        ppt: PuppeteerHelper,
        url: string,
        profile: { user: string; pass: string; index: number },
        comments: VNExDataItem[],
        likeLimit?: number,
    ) {
        const cookiesPath = path.resolve(
            process.cwd(),
            'accounts',
            'puppeteer',
            'vnexpress',
            EMethod.LIKE,
            `(${profile.index}).json`,
        );

        let loginSuccess: boolean | undefined = false;
        if (!fs.existsSync(cookiesPath)) {
            this._logger.instance(id).log('Không tìm thấy cookies. Đang thực hiện đăng nhập...');
            loginSuccess = await retry(
                this._logger.instance(id).error,
                async () => {
                    try {
                        await ppt.startLoginBrowser();
                        await ppt.runOnLoginBrowser(
                            this.__redirect(id, url, 'section.section.page-detail.middle-detail'),
                        );
                        await ppt.runOnLoginBrowser(this.__autoScroll(id));
                        await ppt.runOnLoginBrowser(this.__login(id, profile, EMethod.LIKE));
                        await sleep();
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
            this._logger.instance(id).error('Login không thành công');
            return undefined;
        }

        const cookies = fs.readFileSync(cookiesPath, { encoding: 'utf-8' });
        const result = await retry(
            this._logger.instance(id).error,
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
                    const result = await ppt.runOnNormalBrowser(this.__like(id, comments, likeLimit));

                    return result;
                } catch (error) {
                    throw new Error(error);
                } finally {
                    await ppt.stopNormalBrowser();
                }
            },
            res => res.results.every(result => result.likedFlag),
        );
        return result;
    }

    private __redirect(id: string, url: string, selector: string) {
        return async function (page: PageWithCursor) {
            this._logger.instance(id).log(`Đang điều hướng tới ${url}`);
            await Promise.race([page.goto(url, { waitUntil: 'load' }), page.waitForSelector(selector)]).catch(_ => {});
        };
    }

    private __setCookiesAndRedirect(id: string, url: string, selector: string, cookies: Cookie[]) {
        const log = this._logger.instance(id).log;
        return async function (page: Page) {
            log('Đang thiết lập cookies');
            await page.setCookie(...cookies);

            log(`Đang điều hướng tới ${url}`);
            await Promise.race([page.goto(url, { waitUntil: 'load' }), page.waitForSelector(selector)]).catch(_ => {});
        };
    }

    private __login(id: string, { user, pass, index }: { user: string; pass: string; index: number }, method: EMethod) {
        this._logger.instance(id).log('Đang đăng nhập...');
        const cookiesPath = path.resolve(
            process.cwd(),
            'accounts',
            'puppeteer',
            'vnexpress',
            method.toString(),
            `(${index}).json`,
        );
        const log = this._logger.instance(id).log;

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

                    while (true) {
                        const userInput = innerDoc.querySelector('#myvne_email_input');
                        if (userInput && userInput.value !== user) {
                            userInput.value = user;
                            break;
                        }
                    }
                    while (true) {
                        const passInput = innerDoc.querySelector('#myvne_password_input');
                        if (passInput && passInput.value !== pass) {
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

                    while (true) {
                        const loginButton = innerDoc.querySelector('#myvne_button_login');
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
            log(`Đăng nhập thành công. Đang lưu cookies tại ${cookiesPath}`);
            const cookies = await page.cookies();
            fs.writeFileSync(cookiesPath, JSON.stringify(cookies, null, 2));
        };
    }

    private __autoScroll(id: string, maxScrolls = 15) {
        const logger = this._logger;

        return async function (page: any) {
            let scrolls = 0;

            while (true) {
                logger.instance(id).log(`Đang chạy auto scroll #${scrolls}...`);
                const shouldBreak = await page.evaluate(() => {
                    const distance = Math.floor(Math.random() * 600 + 50);
                    window.scrollBy({ top: distance, behavior: 'smooth' });

                    const anchorEl = document.querySelector('section.section.page-detail.middle-detail');
                    if (!anchorEl) return false;

                    const elBottom = anchorEl.getBoundingClientRect().bottom;
                    return elBottom <= window.innerHeight / 2;
                });
                if (shouldBreak || scrolls >= maxScrolls) break;

                scrolls++;
                await sleep(Math.floor(Math.random() * 7000 + 3000));
            }
        };
    }

    private __loadmoreComments(id: string) {
        this._logger.instance(id).log('Đang bấm "Xem"');
        return async function (page: Page) {
            while (true) {
                const shouldBreak = await page.evaluate(() => {
                    const el = document.querySelector('#show_more_coment');
                    if (!el) return true;
                    el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
                    return false;
                });
                if (shouldBreak) break;
                await sleep();

                await Promise.all([page.click('#show_more_coment'), page.waitForSelector('#show_more_coment')]);
                await sleep(5000);
            }
        };
    }

    private __like(id: string, comments: VNExDataItem[], likeLimit?: number) {
        let breakFlag = false;
        const results: { likedFlag: boolean; liked: number; missing: number }[] = [];
        const { log, error } = this._logger.instance(id);
        log('Đang chạy like...');

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
                if (likeLimit && liked >= likeLimit) {
                    log(`Comment ${comment_id} đã vượt số like cần thiết`);
                    breakFlag = true;
                    results.push({ likedFlag: false, liked, missing: 0 });
                    continue;
                }

                breakFlag = false; // Set this back to false since the comment this time did not exceed the likeLimit
                const missing = likeLimit - liked;

                // Skip if liked
                const buttonAttr = await page.$eval(`a[id="${comment_id}"]`, el => {
                    if (!el) return undefined;
                    return el.getAttribute('data-name');
                });
                if (buttonAttr && buttonAttr === 'like') {
                    log(`Comment ${comment_id} đã được like trước đó`);
                    results.push({ likedFlag: false, liked, missing });
                    continue;
                }

                // Process like the comment
                try {
                    await Promise.all([
                        page.$eval(`a[id="${comment_id}"]`, e => e.click()),
                        page.waitForResponse(
                            r => r.url() === 'https://usi-saas.vnexpress.net/post/cmt/like' && r.status() === 200,
                        ),
                    ]);
                    results.push({ likedFlag: true, liked, missing });
                    log(`Like ${comment_id} thành công`);
                } catch (err) {
                    results.push({ likedFlag: false, liked, missing });
                    error(`Like ${comment_id} thất bại`);
                }

                await sleep(5000);
            }

            return { results, breakFlag };
        };
    }

    async commentVnex({ url, browserNum, isVisual, resetProxy, continueChunk }: VnExpressCommentQuery, body: string) {
        const accounts = readUserPass(this._accountPath, EMethod.COMMENT);
        const comments = body
            .split('\n')
            .map(c => c.trim())
            .filter(c => c.length > 0);

        // Init puppeteer instances
        const ppts = Array.from({ length: browserNum }, () => new PuppeteerHelper(!isVisual, resetProxy));

        // Init results
        const results: { comment: string; success: boolean }[] = [];

        const commentChunk = chunking(comments, browserNum);

        let i = 0;
        const data: { like: number; comment: number; vote: number } = { like: 0, comment: 0, vote: 0 };
        const stateFilePath = 'state.json';
        if (continueChunk && fs.existsSync(stateFilePath)) {
            const data = JSON.parse(fs.readFileSync(stateFilePath, 'utf-8'));
            i = data.like < commentChunk.length ? data.like : 0;
        }

        let totalCommentSuccess = 0;
        let totalAccountUsed = 0;
        let totalCommentFailed = 0;
        for (; i < commentChunk.length; i++) {
            data.comment = i;
            fs.writeFileSync('state.json', JSON.stringify(data));

            this._logger.service.log(`Đang sử dụng bộ account ${i * browserNum + 1} - ${(i + 1) * browserNum}`);

            const promises = commentChunk[i].map((comment, idx) =>
                this._handleCommentVnex(
                    `Browser #${idx}`,
                    ppts[idx],
                    url,
                    { ...accounts[i * browserNum + idx], index: i * browserNum + idx },
                    comment,
                ),
            );
            const result = await Promise.all(promises);

            result.forEach((r, idx) => {
                if (!!r) totalCommentSuccess++;
                else totalCommentFailed++;
                totalAccountUsed++;
                results.push({
                    comment: commentChunk[i][idx],
                    success: !!r,
                });
            });

            this._logger.service.log(
                `${totalCommentSuccess} comment success/${totalAccountUsed} account used (Failed ${totalCommentFailed})`,
            );
        }
        return results;
    }

    private async _handleCommentVnex(
        id: string,
        ppt: PuppeteerHelper,
        url: string,
        profile: { user: string; pass: string; index: number },
        comment: string,
    ) {
        const cookiesPath = path.resolve(
            process.cwd(),
            'accounts',
            'puppeteer',
            'vnexpress',
            EMethod.COMMENT,
            `(${profile.index}).json`,
        );

        let loginSuccess: boolean | undefined = false;
        if (!fs.existsSync(cookiesPath)) {
            loginSuccess = await retry(
                this._logger.instance(id).error,
                async () => {
                    try {
                        await ppt.startLoginBrowser();
                        await ppt.runOnLoginBrowser(
                            this.__redirect(id, url, 'section.section.page-detail.middle-detail'),
                        );
                        await ppt.runOnLoginBrowser(this.__autoScroll(id));
                        await ppt.runOnLoginBrowser(this.__login(id, profile, EMethod.COMMENT));
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
            this._logger.instance(id).error('Login không thành công');
            return undefined;
        }

        const cookies = fs.readFileSync(cookiesPath, { encoding: 'utf-8' });
        const result = await retry(
            this._logger.instance(id).error,
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
        this._logger.instance(id).log('Đang chạy comment...');

        return async function (page: Page) {
            while (true) {
                await page.$eval('#txtComment', el =>
                    el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' }),
                );
                await sleep();
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
            await sleep(5000);

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
        { url, browserNum, isVisual, resetProxy, continueChunk, voteLimit }: VnExpressVoteQuery,
        body: string,
    ) {
        console.clear();

        const accounts = readUserPass(this._accountPath, EMethod.VOTE).slice(0, 5);
        const options = body
            .trim()
            .split(',')
            .map(o => Number(o.trim()));
        const voteCounts = await this._decoyVote(url, options);

        // Init puppeteer instances
        const ppts = Array.from({ length: browserNum }, () => new PuppeteerHelper(!isVisual, resetProxy));

        // Init results
        let results = 0;

        const accountChunk = chunking(accounts, browserNum);
        let i = 0;
        const data: { like: number; comment: number; vote: number } = { like: 0, comment: 0, vote: 0 };
        const stateFilePath = 'state.json';
        if (continueChunk && fs.existsSync(stateFilePath)) {
            const data = JSON.parse(fs.readFileSync(stateFilePath, 'utf-8'));
            i = data.vote < accountChunk.length ? data.like : 0;
        }

        let totalAccountUsed = 0;
        for (; i < accountChunk.length; i++) {
            data.vote = i;
            fs.writeFileSync('state.json', JSON.stringify(data));

            this._logger.service.log(`Đang sử dụng bộ account ${i * browserNum + 1} - ${(i + 1) * browserNum}`);

            const promises = accountChunk[i].map(async (profile, idx) =>
                this._handleVoteVnex(
                    `Browser #${idx}`,
                    ppts[idx],
                    url,
                    { ...profile, index: i * browserNum + idx },
                    options,
                    voteCounts,
                    voteLimit,
                ),
            );
            const result = await Promise.all(promises);
            let breakFlag = true;
            result.forEach(r => {
                totalAccountUsed++;
                if (r) {
                    results += r.voted ? 1 : 0;
                    breakFlag = breakFlag && r.breakFlag;
                }
            });

            this._logger.service.log(`vote success/${totalAccountUsed} account used`);

            if (breakFlag) break;
        }
        return 'Success vote accounts: ' + results;
    }

    private async _decoyVote(url: string, options: number[]) {
        this._logger.service.log('Đang chạy browser để lấy số vote cơ sở');
        const ppt = new PuppeteerHelper(false);
        await ppt.startNormalBrowser();
        const voteCounts = await ppt.runOnNormalBrowser(async (page: Page) => {
            await page.goto(url, { waitUntil: 'load' }).catch(_ => {});
            await page.$eval(`div[id="boxthamdoykien"]`, el =>
                el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' }),
            );
            await sleep();
            await page.click(`.btn_vne.btn_vote_rate.btn_ketqua`);
            await sleep();
            const voteCounts = await page.evaluate((options: number[]) => {
                const voteCounts: NodeListOf<HTMLSpanElement> = document.querySelectorAll('.count-vote-kq');
                const results = options.map(optIdx => Number(voteCounts[optIdx - 1].innerText.replace(/\./g, '')));
                return results;
            }, options);
            return voteCounts;
        });
        await ppt.stopNormalBrowser();

        return voteCounts;
    }

    private async _handleVoteVnex(
        id: string,
        ppt: PuppeteerHelper,
        url: string,
        profile: { user: string; pass: string; index: number },
        options: number[],
        voteCounts: number[],
        voteLimit?: number,
    ) {
        const cookiesPath = path.resolve(
            process.cwd(),
            'accounts',
            'puppeteer',
            'vnexpress',
            EMethod.VOTE,
            `(${profile.index}).json`,
        );

        let loginSuccess: boolean | undefined = false;
        if (!fs.existsSync(cookiesPath)) {
            loginSuccess = await retry(
                this._logger.instance(id).error,
                async () => {
                    try {
                        await ppt.startLoginBrowser();
                        await ppt.runOnLoginBrowser(
                            this.__redirect(id, url, 'section.section.page-detail.middle-detail'),
                        );
                        await ppt.runOnLoginBrowser(this.__autoScroll(id));
                        await ppt.runOnLoginBrowser(this.__login(id, profile, EMethod.VOTE));
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
            this._logger.instance(id).error('Login không thành công');
            return undefined;
        }

        const cookies = fs.readFileSync(cookiesPath, { encoding: 'utf-8' });
        const result = await retry(
            this._logger.instance(id).error,
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
                    return await ppt.runOnNormalBrowser(this.__vote(id, options, voteCounts, voteLimit));
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

    private __vote(
        id: string,
        options: number[],
        voteCountBase: number[],
        timeout = 3 * 60 * 1000,
        voteLimit?: number,
    ) {
        const log = this._logger.instance(id).log;
        log('Đang chạy vote...');

        return async function (page: Page) {
            await page.$eval(`div[id="boxthamdoykien"]`, el =>
                el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' }),
            );
            await sleep();

            // Skip if current like exceed like limit
            await page.click(`.btn_vne.btn_vote_rate.btn_ketqua`);
            await sleep();
            const voteCounts = await page.evaluate((options: number[]) => {
                const voteCounts: NodeListOf<HTMLSpanElement> = document.querySelectorAll('.count-vote-kq');
                const results = options.map(optIdx => Number(voteCounts[optIdx - 1].innerText.replace(/\./g, '')));
                return results;
            }, options);

            const shouldBreak = voteCountBase.every((count, i) => voteCounts[i] - count >= voteLimit);
            if (shouldBreak) return { voted: false, breakFlag: true };

            await page.click('.mfp-close');
            await sleep();

            const opts = await page.$$('.content_box_category > div.item_row_bx');
            if (opts.length === 0) return { voted: true, breakFlag: false }; // Voted

            for (const optIdx of options) {
                await opts[optIdx - 1].click();
                await sleep();
            }
            await sleep(5000);

            await Promise.all([
                page.click(`.btn_vne.btn_vote_rate`),
                page.waitForResponse(r => r.url() === 'https://usi-saas.vnexpress.net/vote/insertvote', {
                    timeout,
                }),
                page.waitForResponse(r => r.url() === 'https://usi-saas.vnexpress.net/api/cf', { timeout }),
            ]);
            await sleep(5000);

            return { voted: true, breakFlag: false };
        };
    }

    async testProxy({ url, browserNum, resetProxy }: VnExpressQuery) {
        // Init puppeteer instances
        const ppts = Array.from({ length: browserNum }, () => new PuppeteerHelper(false, resetProxy));

        const promises = ppts.map(ppt => this._handleTestProxy(ppt, url));
        await Promise.all(promises);
    }

    private async _handleTestProxy(ppt: PuppeteerHelper, url: string) {
        console.log('TEST BROWSER WITH CURSOR');
        await ppt.startLoginBrowser().catch(err => console.log('[CURSOR: start]', err));
        await ppt.runOnLoginBrowser(page => page.goto(url)).catch(err => console.log('[CURSOR: run]', err));
        await sleep(1 * 60 * 1000);
        await ppt.stopLoginBrownser().catch(err => console.log('[CURSOR: end]', err));

        console.log('TEST NORMAL BROWSER');
        await ppt.startNormalBrowser().catch(err => console.log('[NORMAL: start]', err));
        await ppt.runOnNormalBrowser(page => page.goto(url)).catch(err => console.log('[NORMAL: run]', err));
        await sleep(1 * 60 * 1000);
        await ppt.stopNormalBrowser().catch(err => console.log('[NORMAL: end]', err));
    }
}
