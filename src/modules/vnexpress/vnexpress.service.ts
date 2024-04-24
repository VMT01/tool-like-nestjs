import fs from 'fs';
import path from 'path';
import { CookieParam, Page } from 'puppeteer';
import { Cluster } from 'puppeteer-cluster';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

import { Injectable } from '@nestjs/common';

import { ECookieFolder } from '@constants/directory.constant';

import VnExpressSelectors from '@selectors/vnexpress.json';

import { chunking } from '@shared/helpers/array.helper';
import { retryPromise } from '@shared/helpers/promise.helper';
import { waiter } from '@shared/helpers/time.helper';

import { VnExpressRequestQuery } from './dtos/request.dto';
import {
    CommentResultType,
    LikeResultType,
    PuppeteerClusterCommentDataType,
    PuppeteerClusterLikeDataType,
    ResultType,
    VNExDataItem,
    VNExResponse,
} from './vnexpress.type';

puppeteer.use(StealthPlugin());

@Injectable()
export class VnExpressService {
    /**
     * This method will read account cookies from ./accounts/vnexpress
     *                         _______________________^
     *                        |
     * REMEMBER: must place this folder in current workspace
     */
    private _readCookieProfiles() {
        console.log('[VNExpress] Reading profiles');
        const folder = path.join(ECookieFolder.BASE, ECookieFolder.VNEXPRESS);
        if (!fs.existsSync(folder)) {
            throw new Error(`Cookie folder for VNExpress not found! Must resolve this pattern: ${folder}`);
        }

        const cookies: CookieParam[][] = fs.readdirSync(folder).map(f => {
            const content = fs.readFileSync(path.join(folder, f), 'utf-8');
            const { cookies } = JSON.parse(content);
            return cookies.map((cookie: any) => ({ ...cookie, sameSite: 'None' }) as CookieParam[]);
        });
        return cookies;
    }

    /**
     * Like service for like API
     *
     * This service will create a browser pool with worker number equal to profiles number user request.
     * Base on user computer configuration, user can set the worker number respectively.
     *
     * RECOMMEND: 5 profiles
     *
     * Response from running browser parallel is a matrix with each line corresponds to a profile and each column represents the like results of that comment
     *
     * FOR EXAMPLE
     *             comment 1, comment 2, comment 3
     * profile 1: [...       , ...      , ...      ]
     * profile 2: [...       , ...      , ...      ]
     * profile 3: [...       , ...      , ...      ]
     *
     * To get the final response, we sum the total success result of each column and return
     */
    async likeVnex({ url, isVisual, profiles }: VnExpressRequestQuery, body: string) {
        // Fetch comments

        const comments = await retryPromise(
            () => this._fetchAndFilterComments(url, body),
            e => e !== null,
            5,
            1000,
            true,
        );
        if (comments === null) return { success: false, message: 'VNExpress API Fetch comments failed' };

        // Read profiles
        const cookiesList = this._readCookieProfiles();

        // Initial result
        const result: LikeResultType[] = [];
        // eslint-disable-next-line @typescript-eslint/prefer-for-of
        for (let i = 0; i < comments.length; i++) {
            result.push({ success: 0, noAction: 0, failed: 0 });
        }

        // Init browser pool
        const cluster = await Cluster.launch({
            concurrency: Cluster.CONCURRENCY_BROWSER,
            maxConcurrency: profiles,
            puppeteerOptions: { headless: !isVisual },
            puppeteer,
            monitor: true,
        });

        // Run like in parallel
        for (const cookiess of chunking(cookiesList, profiles)) {
            const promises: Promise<number[]>[] = cookiess.map(cookies =>
                cluster.execute(
                    {
                        url,
                        cookies,
                        loadMoreFunction: this.__loadmore,
                        likeFunction: this.__runLike(comments),
                        retryPromise,
                    } as PuppeteerClusterLikeDataType,
                    this._likeVnex,
                ),
            );
            // Avoid error
            const responses = await Promise.allSettled(promises);
            for (const response of responses) {
                if (response.status === 'rejected') {
                    // Error happend
                    result.forEach(r => r.failed++);
                } else {
                    // Handle response from Puppeteer
                    response.value.forEach((v, idx) =>
                        v === 2 ? result[idx].success++ : v === 1 ? result[idx].noAction++ : result[idx].failed++,
                    );
                }
            }
        }
        await cluster.idle();
        await cluster.close();

        // Calculate final result
        const finalResult: ResultType = { totalLike: 0, data: [] };
        result.forEach((r, idx) => {
            finalResult.data.push({
                comment: comments[idx].content,
                totalLike: comments[idx].userlike,
                ...r,
            });
            finalResult.totalLike += comments[idx].userlike + r.success;
        });
        return finalResult;
    }

    private async _fetchAndFilterComments(url: string, commentBody: string) {
        console.log('[VNExpress] Fetching VNExpress comments');

        const comments = commentBody.split('\n').map(c => c.trim());
        const id = url.split('.')[1].split('-').at(-1);
        const commentPromises = [1, 2, 3].map(v =>
            fetch(
                `https://usi-saas.vnexpress.net/index/get?objectid=${id}&objecttype=${v}&siteid=1000000&offset=0&limit=500`,
            ),
        );

        // Fetch comment list from VNExpress
        try {
            const response = await Promise.all(commentPromises);
            const data: VNExResponse[] = await Promise.all(response.map(r => r.json()));
            const listCommentApi = data.reduce((acc: VNExDataItem[], v: VNExResponse) => acc.concat(v.data.items), []);

            // Filter for comments that have the same content as requested
            const listCommentSub: VNExDataItem[] = listCommentApi.filter(
                comment => !!comments.find(c => comment.content.includes(c)),
            );

            return listCommentSub;
        } catch (err) {
            return null;
        }
    }

    /**
     * Like VNExpress method for like service
     */
    private async _likeVnex({
        page,
        data: { url, cookies, loadMoreFunction, likeFunction, retryPromise },
    }: {
        page: Page;
        data: PuppeteerClusterLikeDataType;
    }) {
        // Set profile for current browser session
        await page.setCookie(...cookies);

        // Try navigating to destination URL
        const navigate = async () => {
            try {
                await page.goto(url, { waitUntil: 'networkidle2', timeout: 5 * 60 * 1000 }); // Currently set timeout 5 mins for avoiding error
                return true;
            } catch (err) {
                return false;
            }
        };
        await retryPromise(navigate, flag => flag, 5, 1_000);

        // Try to load more comments
        const loadMore = async () => await loadMoreFunction(page);
        await retryPromise(loadMore, flag => flag, 5, 1_000);
        await new Promise(rs => setTimeout(rs, 1_000));

        // Try to like comments
        const like = async () => await likeFunction(page);
        const result = await retryPromise(like, result => !result.some(_ => 0), 5, 1_000);
        await new Promise(rs => setTimeout(rs, 1_000));

        return result;
    }

    /**
     * Load more comment in current page
     */
    private async __loadmore(page: Page) {
        let commentCounter = 0;
        while (true) {
            const loadMore = await page.$(VnExpressSelectors.like.load_more);
            if (!loadMore) break;

            const commentLength = await page.$$eval(VnExpressSelectors.like.comment_item, els => els.length);
            if (commentLength > commentCounter) {
                commentCounter = commentLength;
                await loadMore.click();
            } else break;

            await waiter(1_000);
        }

        const loadMore = await page.$(VnExpressSelectors.like.load_more);
        return !loadMore;
    }

    /**
     * Like required comments
     *
     * @returns An array of like response object. This object contain
     * - success: Click like success
     * - noAction: Current profile liked this comment so we ignore this
     * - failed: Something weird happend so we have to return failed
     */
    private __runLike(comments: VNExDataItem[]) {
        return async function(page: Page) {
            const finalResult: number[] = [];
            for (const { comment_id } of comments) {
                /**
                 * First time - Check for like button
                 * If liked => skip
                 * If not => click like
                 */
                let result = await page.evaluate(
                    (comment_id, attr) => {
                        const el = document.getElementById(comment_id);
                        if (!el) return 0; // Element not found => ERROR

                        const elAttr = el.getAttribute(attr);
                        if (elAttr || elAttr === 'like') return 1; // Liked => No Action

                        (<HTMLAnchorElement>el).click();
                        return 2;
                    },
                    comment_id,
                    VnExpressSelectors.like.like_attribute,
                );
                await waiter(1_000);

                /**
                 * Second time: After first time run we receive status 2, which means like success
                 * We have to re-check this whether it really liked
                 */
                if (result === 2) {
                    await page.evaluate(
                        (comment_id, attr) => {
                            const el = document.getElementById(comment_id);
                            const elAttr = el.getAttribute(attr);
                            if (elAttr || elAttr === 'like') return; // Truly liked
                            (<HTMLAnchorElement>el).click(); // If not, click again
                        },
                        comment_id,
                        VnExpressSelectors.like.like_attribute,
                    );
                    await waiter(1_000);

                    /**
                     * Final check: After second click, we check if this comment is liked
                     * If not, return error
                     */
                    result = await page.evaluate(
                        (comment_id, attr) => {
                            const el = document.getElementById(comment_id);
                            const elAttr = el.getAttribute(attr);
                            if (elAttr || elAttr === 'like') return 2; // Truly liked
                            return 0;
                        },
                        comment_id,
                        VnExpressSelectors.like.like_attribute,
                    );
                }

                finalResult.push(result);
            }

            return finalResult;
        };
    }

    async commentVnex({ url, isVisual, profiles }: VnExpressRequestQuery, body: string) {
        // Init browser pool
        const cluster = await Cluster.launch({
            concurrency: Cluster.CONCURRENCY_BROWSER,
            maxConcurrency: profiles,
            puppeteerOptions: { headless: !isVisual },
            puppeteer,
            monitor: true,
        });

        // Read profiles
        const cookiesList = this._readCookieProfiles();

        // Mapping profile into comment
        const comments = body.split('\n').map(c => c.trim());
        const commentVsProfiles = comments.map((comment, idx) => ({
            comment,
            cookies: cookiesList[idx % cookiesList.length],
        }));

        // Initial result
        const result: CommentResultType = [];

        // Run comment in parallel
        for (const commentVsProfile of chunking(commentVsProfiles, profiles)) {
            const promises: Promise<void>[] = commentVsProfile.map(cvp =>
                cluster.execute(
                    {
                        url,
                        cookies: cvp.cookies,
                        commentFunction: this.__runComment(cvp.comment),
                    } as PuppeteerClusterCommentDataType,
                    this._commentVnex,
                ),
            );

            // Avoid error
            const responses = await Promise.allSettled(promises);
            responses.forEach((r, idx) =>
                r.status === 'rejected'
                    ? result.push({ comment: commentVsProfile[idx].comment, success: false, message: r.reason })
                    : result.push({ comment: commentVsProfile[idx].comment, success: true }),
            );
        }

        await cluster.idle();
        await cluster.close();

        return result;
    }

    private async _commentVnex({
        page,
        data: { url, cookies, commentFunction },
    }: {
        page: Page;
        data: PuppeteerClusterCommentDataType;
    }) {
        await page.setCookie(...cookies); // Set profile for current browser session
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 5 * 60 * 1000 }); // Currently set timeout 5mins for avoiding error
        await commentFunction(page);
    }

    private __runComment(comment: string) {
        return async function(page: Page) {
            while (true) {
                await waiter();
                await page.click(VnExpressSelectors.comment.text_area, { clickCount: 3 });
                await page.type(VnExpressSelectors.comment.text_area, comment);
                const commentTyped = await page.$eval(
                    VnExpressSelectors.comment.text_area,
                    (el, comment) => {
                        const message = (<HTMLTextAreaElement>el).value;
                        if (message === comment) return true;
                        return false;
                    },
                    comment,
                );
                if (commentTyped) break;
            }

            await waiter();
            await page.click(VnExpressSelectors.comment.submit_button); // TODO: Uncomment this

            // Wait
        };
    }
}
