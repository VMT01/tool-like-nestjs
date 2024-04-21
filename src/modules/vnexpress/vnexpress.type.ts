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
