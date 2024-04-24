import { Module } from '@nestjs/common';

import MODULES from './modules';

@Module({
    imports: [...MODULES],
})
export class AppModule {}
