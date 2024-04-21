import { NextFunction, Request, Response } from 'express';
import fs from 'fs';

import { NestMiddleware } from '@nestjs/common';

export class RemoveFolderMiddleware implements NestMiddleware {
    use(req: Request, _res: Response, next: NextFunction) {
        const [_, source] = req.baseUrl.split('/');
        const path = `uploads/${source}`;
        if (fs.existsSync(path)) {
            console.log('Remove', path);
            fs.rmSync(path, { recursive: true, force: true });
            fs.mkdirSync(path);
        }
        next();
    }
}
