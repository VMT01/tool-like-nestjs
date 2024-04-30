import fs from 'fs';
import { CookieParam, ElementHandle, Page, WaitForOptions } from 'puppeteer';

import { Injectable } from '@nestjs/common';

import { EServiceKind } from '@constants/service-kind.constant';

import VnExpressSelectors from '@selectors/vnexpress.json';

import { chunking } from '@shared/helpers/array.helper';
import { readCookies } from '@shared/helpers/profile.helper';
import { retryPromise, waiter } from '@shared/helpers/promise.helper';
import { PuppeteerHelper } from '@shared/helpers/puppeteer.helper';

import { VnExpressCommentQuery, VnExpressLikeQuery } from './dtos/request.dto';
import { CommentResultType, LikeResultType, ResultType, VNExDataItem, VNExResponse } from './vnexpress.type';

@Injectable()
export class VnExpressService {
    async likeVnex({ url, profileNum, likeLimit, isVisual }: VnExpressLikeQuery, body: string) {
        const cookiess = readCookies(EServiceKind.VNEXPRESS);
        const comments = await retryPromise<VNExDataItem[] | undefined>(
            async () => await this._fetchAndFilterComments(url, body),
            () => true,
        );
        if (!comments) throw new Error('Network error while fetching VNExpress comments');

        const ppt = new PuppeteerHelper(profileNum, !isVisual);

        const result: LikeResultType[] = [];
        comments.forEach(_ => result.push({ success: 0, noAction: 0, failed: 0 }));

        const profileChunk = chunking(cookiess, profileNum);
        for (let i = 0; i < profileChunk.length; i++) {
            console.log(`[VNExpress] Running at chunk ${i + 1} / ${profileChunk.length}`);
            await ppt.initInstances();
            const responses = await ppt.runInstances(this._likeVnex(url, profileChunk[i], comments));
            for (const response of responses) {
                if (!response) {
                    for (const r of result) r.failed++;
                    continue;
                }
                response.forEach((v, idx) => {
                    if (v === 2) result[idx].success++;
                    if (v === 1) result[idx].noAction++;
                    if (v === 0) result[idx].failed++;
                });
            }
            await ppt.killInstances();
            if (likeLimit && !result.some(r => r.success < likeLimit)) break;
        }

        const finalResult: ResultType = { totalLike: 0, data: [] };
        result.forEach((r, idx) => {
            finalResult.data.push({
                comment: comments[idx].content,
                totalLike: comments[idx].userlike,
                ...r,
            });
            finalResult.totalLike += comments[idx].userlike + r.success;
        });

        fs.writeFileSync('VNExpress-like.json', JSON.stringify(finalResult, undefined, 2));
        console.log('Wrote results to file VNExpress-like.json');
        return finalResult;
    }

    /**
     * Fetch and filter comment list from VNExpress API that match required comments
     */
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
        url: string,
        profiles: CookieParam[][],
        comments: VNExDataItem[],
        waitForOptions: WaitForOptions = {
            waitUntil: 'networkidle2',
            timeout: 3 * 60 * 1000,
        },
    ) {
        return profiles.map(
            profile =>
                async function(page: Page) {
                    const loadMore = async function() {
                        let loadMore: ElementHandle<HTMLAnchorElement>;
                        let commentCounter = 0;
                        while (true) {
                            loadMore = (await page.$(
                                VnExpressSelectors.like.load_more,
                            )) as ElementHandle<HTMLAnchorElement>;
                            if (!loadMore) break;

                            const commentLength = await page.$$eval(
                                VnExpressSelectors.like.comment_item,
                                els => els.length,
                            );
                            if (commentLength <= commentCounter) break;

                            commentCounter = commentLength;
                            await loadMore.click();
                            await waiter();
                        }
                        await waiter(2000); // 2s
                    };

                    const like = async function(comment_id: string) {
                        const result = await page.evaluate(
                            (comment_id, attr) => {
                                const el = document.getElementById(comment_id);
                                if (!el) return 0; // Element not found error

                                const elAttr = el.getAttribute(attr);
                                if (elAttr || elAttr === 'like') return 1; // Liked => No Action

                                (<HTMLAnchorElement>el).click();
                                return 2;
                            },
                            comment_id,
                            VnExpressSelectors.like.like_attribute,
                        );

                        if (result === 2) await waiter();
                        return result;
                    };

                    const run = async () => {
                        await page.deleteCookie();
                        await page.setCookie(...profile);
                        await page.goto(url, waitForOptions);
                        await loadMore();

                        // Like comments
                        const results: number[] = [];
                        for (const { comment_id } of comments) {
                            const result = await like(comment_id);
                            results.push(result);
                        }

                        if (results.includes(0) || results.includes(2)) {
                            await Promise.all([page.reload(waitForOptions), page.waitForNavigation(waitForOptions)]);
                            for (let i = 0; i < comments.length; i++) {
                                const result = await like(comments[i].comment_id);
                                if (result !== 1) results[i] = result;
                            }
                        }

                        await waiter(3000);
                        await page.deleteCookie();
                        return results;
                    };
                    return await retryPromise<number[] | undefined>(
                        run,
                        result => !result.includes(0),
                        (newData, oldData) => {
                            if (!oldData) return newData;

                            for (let i = 0; i < newData.length; i++) {
                                if (newData[i] === 0) continue;
                                if (newData[i] === 1) oldData[i] = oldData[i] === 2 ? 2 : 1;
                                if (newData[i] === 2) oldData[i] = 2;
                            }

                            return oldData;
                        },
                    );
                },
        );
    }

    async commentVnex({ url, profileNum, isVisual }: VnExpressCommentQuery, body: string) {
        const cookiess = readCookies(EServiceKind.VNEXPRESS);
        const comments = body
            .split('\n')
            .map(c => c.trim())
            .filter(c => c.length > 0);
        const commentVsProfiles = comments.map((comment, idx) => ({
            comment,
            cookies: cookiess[(idx % cookiess.length) + 1],
        }));

        const ppt = new PuppeteerHelper(profileNum, !isVisual);

        const result: CommentResultType = [];

        const commentVsProfileChunk = chunking(commentVsProfiles, profileNum);
        for (let i = 0; i < commentVsProfileChunk.length; i++) {
            console.log(`[VNExpress] Running at chunk ${i + 1} / ${commentVsProfileChunk.length}`);
            await ppt.initInstances();
            const responses = await ppt.runInstances(this._commentVnex(url, commentVsProfileChunk[i]));
            responses.forEach((r, idx) =>
                r[0]
                    ? result.push({ comment: commentVsProfileChunk[i][idx].comment, success: true })
                    : result.push({ comment: commentVsProfileChunk[i][idx].comment, success: false }),
            );
            await ppt.killInstances();
        }

        fs.writeFileSync('VNExpress-comment.json', JSON.stringify(result, undefined, 2));
        return result;
    }

    private _commentVnex(
        url: string,
        commentVsProfiles: { comment: string; cookies: CookieParam[] }[],
        waitForOptions: WaitForOptions = {
            waitUntil: 'networkidle2',
            timeout: 3 * 60 * 1000,
        },
    ) {
        return commentVsProfiles.map(
            commentVsProfile =>
                async function(page: Page) {
                    const run = async () => {
                        await page.deleteCookie();
                        await page.setCookie(...commentVsProfile.cookies);

                        // Navigate to destination URL
                        await page.goto(url, waitForOptions);

                        // Run comments
                        while (true) {
                            await waiter();
                            await page.click(VnExpressSelectors.comment.text_area, { clickCount: 3 });
                            await page.type(VnExpressSelectors.comment.text_area, commentVsProfile.comment);
                            const commentTyped = await page.$eval(
                                VnExpressSelectors.comment.text_area,
                                (el, comment) => {
                                    const message = (<HTMLTextAreaElement>el).value;
                                    if (message === comment) return true;
                                    return false;
                                },
                                commentVsProfile.comment,
                            );
                            if (commentTyped) break;
                        }
                        await waiter();

                        await page.click(VnExpressSelectors.comment.submit_button);
                        await waiter();

                        return true;
                    };

                    return await retryPromise<boolean | undefined>(run, () => true);
                },
        );
    }
}
