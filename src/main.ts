import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';

async function bootstrap() {
    const app = await NestFactory.create<NestExpressApplication>(AppModule);
    app.useBodyParser('text');

    SwaggerModule.setup('/docs', app, SwaggerModule.createDocument(app, new DocumentBuilder().build()));

    await app.listen(3000);
}
bootstrap();
