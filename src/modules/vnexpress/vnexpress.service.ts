import fs from 'fs';
import path from 'path';
import { CookieParam, Page } from 'puppeteer';
import VnExpressSelectors from 'selectors/vnexpress.json';

import { Injectable } from '@nestjs/common';

import { chunking } from '@shared/helpers/array.helper';
import { PuppeteerHelper } from '@shared/helpers/puppeteer.helper';
import { waiter } from '@shared/helpers/time.helper';

import { VnExpressRequestQuery } from './dtos/request.dto';
import { VNExDataItem, VNExResponse } from './vnexpress.type';

@Injectable()
export class VnExpressService {
    private readonly ppt: PuppeteerHelper;

    constructor() {
        this.ppt = new PuppeteerHelper();
    }

    async likeVnex({ url, isVisual, profiles }: VnExpressRequestQuery, body: string) {
        const cookies = this._readCookieProfiles();
        const comments = body.split('\n').map(c => c.trim());
        const id = url.split('.')[1].split('-').at(-1);

        const commentPromises = [1, 2, 3].map(v => {
            const url = `https://usi-saas.vnexpress.net/index/get?objectid=${id}&objecttype=${v}&siteid=1000000&offset=0&limit=500`;
            return fetch(url);
        });
        const response = await Promise.all(commentPromises);
        const data: VNExResponse[] = await Promise.all(response.map(r => r.json()));
        const listCommentApi = data.reduce((acc: VNExDataItem[], v: VNExResponse) => acc.concat(v.data.items), []);

        // Filter for comments that have the same content as requested
        const listCommentSub = listCommentApi.filter(comment => !!comments.find(c => comment.content.includes(c)));

        const cookieChunks = chunking(cookies, profiles);
        for (let i = 0; i < cookieChunks.length; i++) {
            console.log(`Running at chunk ${i + 1}/${cookieChunks.length}`);
            const promises = cookieChunks[i].map((cookies, idx) =>
                this._likeVnex(url, isVisual, cookies, listCommentSub, idx),
            );
            await Promise.all(promises);
        }
    }

    private _readCookieProfiles() {
        const cookies: CookieParam[][] = fs.readdirSync('uploads/vnexpress').map(f => {
            const content = fs.readFileSync(path.join('uploads/vnexpress', f), 'utf-8');
            const { cookies } = JSON.parse(content);
            return cookies.map((cookie: any) => ({ ...cookie, sameSite: 'None' }) as CookieParam[]);
        });
        return cookies;
    }

    private async _likeVnex(
        url: string,
        isVisual: boolean,
        cookies: CookieParam[],
        comments: VNExDataItem[],
        idx: number,
    ) {
        console.log('Running for account index', idx + 1);

        let stopFlag = false;

        await this.ppt.start(!isVisual);

        while (!stopFlag) {
            try {
                await this.ppt.run(p => p.setCookie(...cookies));
                await this.ppt.go(url, 'networkidle2');
                await this.ppt.run(this.__loadmore);
                await this.ppt.run(this.__runLike(comments));
                stopFlag = true;
            } catch (err) {
                console.log('Failed!', err.message);
            }
        }

        await waiter(5_000); // wait for 5s
        await this.ppt.stop();
    }

    private async __loadmore(page: Page) {
        console.log('[VNExpress Service] __loadmore');
        while (true) {
            await waiter();
            const loadMore = await page.$(VnExpressSelectors.like.load_more);
            if (!loadMore) break;
            await loadMore.click();
        }
    }

    private __runLike(comments: VNExDataItem[]) {
        console.log('[VNExpress Service] __runLike');
        return async function(page: Page) {
            await page.evaluate(
                (comments, likeAttribute) => {
                    for (const comment of comments) {
                        const el = document.getElementById(comment.comment_id);
                        const elAttr = el.getAttribute(likeAttribute);
                        if (!elAttr || elAttr !== 'like') el.click();
                    }
                },
                comments,
                VnExpressSelectors.like.like_attribute,
            );
        };
    }
}
