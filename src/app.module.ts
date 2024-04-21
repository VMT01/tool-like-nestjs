import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';

import { RemoveFolderMiddleware } from '@shared/middlewares/remove-folder.middleware';

import MODULES from './modules';

@Module({
    imports: [...MODULES],
})
export class AppModule implements NestModule {
    configure(consumer: MiddlewareConsumer) {
        consumer.apply(RemoveFolderMiddleware).forRoutes('/*/upload-account');
    }
}
