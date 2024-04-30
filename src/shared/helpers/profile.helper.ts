import fs from 'fs';
import path from 'path';
import { CookieParam } from 'puppeteer';

import { ECookieFolder } from '@constants/directory.constant';
import { EServiceKind } from '@constants/service-kind.constant';

export function readCookies(serviceKind: EServiceKind): CookieParam[][] {
    let dir: string = ECookieFolder.BASE;
    switch (serviceKind) {
        case EServiceKind.VNEXPRESS:
            dir = path.join(dir, ECookieFolder.VNEXPRESS);
            break;
        default:
            throw new Error('Loại dịch vụ này chưa được hỗ trợ');
    }

    if (!fs.existsSync(dir)) throw new Error(`Hãy cung cấp danh sách cookies theo folder sau: ${dir}`);

    const cookiess = fs.readdirSync(dir).map(f => {
        const content = fs.readFileSync(path.join(dir, f), 'utf-8');
        const { cookies } = JSON.parse(content);
        return cookies.map((cookie: any) => ({ ...cookie, sameSite: 'None' }));
    });
    return cookiess;
}
