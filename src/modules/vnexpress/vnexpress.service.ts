import { CookieParam, ElementHandle, Page, WaitForOptions } from 'puppeteer';

import { Injectable } from '@nestjs/common';

import { EServiceKind } from '@constants/service-kind.constant';

import VnExpressSelectors from '@selectors/vnexpress.json';

import { chunking } from '@shared/helpers/array.helper';
import { readCookies } from '@shared/helpers/profile.helper';
import { retry, waiter } from '@shared/helpers/promise.helper';
import { PuppeteerHelper } from '@shared/helpers/puppeteer.helper';

import { VnExpressCommentQuery } from './dtos/request-comment.dto';
import { VnExpressLikeQuery } from './dtos/request-like.dto';
import { VNExDataItem, VNExResponse } from './vnexpress.type';

@Injectable()
export class VnExpressService {
    async likeVnex({ url, browserNum, likeLimit, isVisual }: VnExpressLikeQuery, body: string) {
        const profiles = readCookies(EServiceKind.VNEXPRESS);

        // Fetch VNExpress comments
        const vnExComments = await retry(
            'VNExpressService',
            async () => await this._fetchAndFilterComments(url, body),
            () => true,
        );
        if (!vnExComments) throw new Error('Network error while fetching VNExpress comments');

        // Init puppeteer instances
        const ppts: PuppeteerHelper[] = [];
        for (let i = 0; i < browserNum; i++) {
            ppts.push(new PuppeteerHelper(!isVisual));
        }

        // Init results
        const results = vnExComments.map(v => ({
            comment: v.content,
            like: v.userlike,
            success: 0,
        }));
        let totalSuccess = 0;

        const profileChunk = chunking(profiles, browserNum);
        let breakFlag = false;

        for (let i = 0; i < profileChunk.length; i++) {
            console.log(`[VNExpress] Running at chunk ${i + 1} / ${profileChunk.length}`);
            const promises = profileChunk[i].map(async (profile, idx) => {
                await ppts[idx].start();
                await waiter();
                const result = await retry(
                    `Browser #${idx}`,
                    async () =>
                        await ppts[idx].run(this._likeVnex(`Browser #${idx}`, url, profile, vnExComments, likeLimit)),
                    () => true,
                );
                await ppts[idx].stop();

                return result;
            });

            const result = await Promise.all(promises);
            for (const r of result) {
                if (!r) continue;

                r.results.forEach((v, idx) => {
                    if (v === 1) {
                        results[idx].success++;
                        totalSuccess++;
                    }
                });
                breakFlag = breakFlag || r.breakFlag;
            }
            if (breakFlag) break;
        }

        return { totalSuccess, results };
    }

    private async _fetchAndFilterComments(url: string, body: string) {
        console.log('[VNExpress] Fetching VNExpress comments');

        const comments = body
            .split('\n')
            .map(c => c.trim())
            .filter(c => c.length > 0);
        const id = url.split('.')[1].split('-').at(-1);
        const commentPromises = [1, 2, 3].map(v =>
            fetch(
                `https://usi-saas.vnexpress.net/index/get?objectid=${id}&objecttype=${v}&siteid=1000000&offset=0&limit=500`,
            ),
        );

        // Fetch comment list from VNExpress
        const response = await Promise.all(commentPromises);
        const data: VNExResponse[] = await Promise.all(response.map(r => r.json()));
        const listCommentApi = data.reduce((acc: VNExDataItem[], v: VNExResponse) => acc.concat(v.data.items), []);

        // Filter for comments that have the same content as requested
        const listCommentSub: VNExDataItem[] = listCommentApi.filter(
            comment => !!comments.find(c => comment.content.includes(c)),
        );

        return listCommentSub;
    }

    private _likeVnex(
        id: any,
        url: string,
        cookies: CookieParam[],
        comments: VNExDataItem[],
        likeLimit?: number,
        waitForOptions: WaitForOptions = { waitUntil: 'networkidle2', timeout: 1 * 60 * 1000 },
    ) {
        return async function(page: Page) {
            let breakFlag = false;

            // Login
            await page.setCookie(...cookies);
            await page.goto(url, waitForOptions);

            // Load more
            console.log(`[${id}] Loading more...`);
            let _: ElementHandle<Element>;
            while ((_ = await page.$(VnExpressSelectors.like.load_more))) {
                await Promise.all([
                    page.click(VnExpressSelectors.like.load_more),
                    page.waitForSelector(VnExpressSelectors.like.load_more, waitForOptions),
                ]);
                await waiter();
            }

            // Like
            const results: number[] = [];
            for (const { comment_id, userlike } of comments) {
                // Scroll to view;
                await page.$eval(`a[id="${comment_id}"]`, el =>
                    el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' }),
                );
                await waiter();

                // Skip if current like exceed like limit
                const currentLike = await page.$eval(`div.reactions-total[rel="${comment_id}"]`, el =>
                    Number(el.innerText.split('.').join('')),
                );
                if (likeLimit !== undefined && currentLike - userlike >= likeLimit) {
                    console.log(`[${id}] Skip ${comment_id} since exceeded like limit`);
                    breakFlag = true;
                    results.push(0);
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
                    results.push(0);
                    continue;
                }

                // Like if not liked
                await Promise.all([
                    page.click(`a[id="${comment_id}"]`),
                    page.waitForResponse(
                        r => r.url() === 'https://usi-saas.vnexpress.net/cmt/v2/like' && r.status() === 200,
                        {
                            timeout: waitForOptions.timeout,
                        },
                    ),
                ]);
                console.log(`[${id}] ${comment_id} like success`);
                results.push(1);
                await waiter();

                const noti = await page.$(VnExpressSelectors.like.noti);
                if (noti) {
                    console.log(`[${id}] Closing block noti...`);
                    await page.click(VnExpressSelectors.like.noti);
                    results.push(0); // Since we cannot do anything here
                }
            }

            // Wait for cleaning
            await waiter();

            // Logout
            await page.deleteCookie(...cookies);
            return { results, breakFlag };
        };
    }

    async commentVnex({ url, browserNum, isVisual }: VnExpressCommentQuery, body: string) {
        const profiles = readCookies(EServiceKind.VNEXPRESS);
        const comments = body
            .split('\n')
            .map(c => c.trim())
            .filter(c => c.length > 0);
        const commentVsProfiles = comments.map((comment, idx) => ({
            comment,
            cookies: profiles[(idx % profiles.length) + 1],
        }));

        // Init results
        const results: { comment: string; success: boolean }[] = [];

        // Init puppeteer instances
        const ppts: PuppeteerHelper[] = [];
        for (let i = 0; i < browserNum; i++) {
            ppts.push(new PuppeteerHelper(!isVisual));
        }

        const commentVsProfileChunk = chunking(commentVsProfiles, browserNum);
        for (let i = 0; i < commentVsProfileChunk.length; i++) {
            console.log(`[VNExpress] Running at chunk ${i + 1} / ${commentVsProfileChunk.length}`);
            const promises = commentVsProfileChunk[i].map(async (cvp, idx) => {
                await ppts[idx].start();
                const result = await retry(
                    `Browser #${idx}`,
                    async () => await ppts[idx].run(this._commentVnex(`Browser #${idx}`, url, cvp)),
                    () => true,
                );
                await ppts[idx].stop();
                return result;
            });

            const result = await Promise.all(promises);
            result.forEach((r, idx) =>
                r
                    ? results.push({ comment: commentVsProfileChunk[i][idx].comment, success: true })
                    : results.push({ comment: commentVsProfileChunk[i][idx].comment, success: false }),
            );
        }
    }

    private _commentVnex(
        id: any,
        url: string,
        { comment, cookies }: { comment: string; cookies: CookieParam[] },
        waitForOptions: WaitForOptions = { waitUntil: 'networkidle2', timeout: 1 * 60 * 1000 },
    ) {
        return async function(page: Page) {
            // Login
            await page.setCookie(...cookies);
            await page.goto(url, waitForOptions);

            // Run comments
            console.log(`[${id}] Typing comment: ${comment}`);
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

            console.log(`[${id}] Click submit comment`);
            // await page.click(VnExpressSelectors.comment.submit_button);
            await waiter();

            // Logout
            await page.deleteCookie(...cookies);
            return true;
        };
    }
}
