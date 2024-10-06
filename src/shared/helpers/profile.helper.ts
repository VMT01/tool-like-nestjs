import fs from 'fs';
import path from 'path';
import { CookieParam } from 'puppeteer';

import { ECookieFolder } from '@constants/directory.constant';
import { EServiceKind } from '@constants/service-kind.constant';

const serviceKindToDir = {
    [EServiceKind.VNEXPRESS]: path.join(ECookieFolder.BASE, ECookieFolder.VNEXPRESS),
};

export function readCookies(serviceKind: EServiceKind): CookieParam[][] {
    const dir = serviceKindToDir[serviceKind];
    if (!dir) throw new Error('Loại dịch vụ này chưa được hỗ trợ');
    if (!fs.existsSync(dir)) throw new Error(`Hãy cung cấp danh sách cookies theo folder sau: ${dir}`);

    const cookiess = fs.readdirSync(dir).map(f => {
        const content = fs.readFileSync(path.join(dir, f), 'utf-8');
        const { cookies } = JSON.parse(content);
        return cookies.map((cookie: any) => ({ ...cookie, sameSite: 'None' }));
    });
    return cookiess;
}

export function readUserPass(accountPath: string) {
    const accountRaw = fs.readFileSync(accountPath, 'utf-8');
    const accounts = accountRaw
        .trim()
        .split('\n')
        .map(account => {
            const [user, pass] = account.trim().split('|');
            return { user, pass };
        });
    return accounts;
}
