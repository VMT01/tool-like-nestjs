import { Module } from '@nestjs/common';

import { VnExpressController } from './vnexpress.controller';
import { VnExpressService } from './vnexpress.service';

@Module({
    imports: [],
    providers: [VnExpressService],
    controllers: [VnExpressController],
    exports: [],
})
export class VnExpressModule {}
