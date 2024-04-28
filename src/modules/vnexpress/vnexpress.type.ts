import { CookieParam, Page } from 'puppeteer';

export type VNExDataItem = {
    comment_id: string;
    parent_id: string;
    article_id: number;
    content: string;
    full_name: string;
    creation_time: number;
    time: string;
    userlike: number;
    t_r_1: number;
    t_r_2: number;
    t_r_3: number;
    t_r_4: number;
    replys: { total: number; items: any[] };
    userid: number;
    type: number;
    like_ismember: boolean;
    rating: {};
    is_pin: number;
};

export type VNExData = {
    total: number;
    totalitem: number;
    items: VNExDataItem[];
    items_pin: any[];
    offset: number;
};

export type VNExResponse = {
    error: number;
    errorDescription: string;
    iscomment: number;
    data: VNExData;
};

export type VNExAccount = {
    username: string;
    password: string;
};

export type ResultType = {
    totalLike: number;
    data: { comment: string; totalLike: number; success: number; noAction: number; failed: number }[];
};

export type PuppeteerClusterLikeDataType = {
    url: string;
    cookies: CookieParam[];
    loadMoreFunction: (page: Page) => Promise<boolean>;
    likeFunction: (page: Page) => Promise<number[]>;
    retryPromise: <T>(
        f: () => Promise<T>,
        condition: (e: T) => boolean,
        maxRetries: number,
        delay: number,
    ) => Promise<T>;
};

export type PuppeteerLikeResponseType = Array<{
    success: boolean;
    noAction: boolean;
    failed: boolean;
}>;

export type LikeResultType = {
    success: number;
    noAction: number;
    failed: number;
};

export type PuppeteerClusterCommentDataType = {
    url: string;
    cookies: CookieParam[];
    commentFunction: (page: Page) => Promise<boolean>;
    retryPromise: <T>(
        f: () => Promise<T>,
        condition: (e: T) => boolean,
        maxRetries: number,
        delay: number,
        resolveError?: boolean,
    ) => Promise<T>;
};

export type CommentResultType = Array<{
    comment: string;
    success: boolean;
    message?: any;
}>;
