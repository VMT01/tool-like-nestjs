import { ValidationPipe } from '@nestjs/common';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { ExceptionsFilter } from '@shared/filters/exceptions.filter';

import { AppModule } from './app.module';

async function bootstrap() {
    process.env.DEBUG = 'puppeteer-cluster:*';

    const app = await NestFactory.create<NestExpressApplication>(AppModule);
    app.useBodyParser('text');
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    app.useGlobalFilters(new ExceptionsFilter(app.get(HttpAdapterHost)));

    SwaggerModule.setup('/docs', app, SwaggerModule.createDocument(app, new DocumentBuilder().build()));

    await app.listen(3000);
    console.log(`Server is running at http://localhost:3000/docs`);
}
bootstrap();
