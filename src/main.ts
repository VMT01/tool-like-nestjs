import fs from 'fs';
import path from 'path';

import { ValidationPipe } from '@nestjs/common';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { EMethod } from '@constants/service-kind.constant';

import { ExceptionsFilter } from '@shared/filters/exceptions.filter';

import { AppModule } from './app.module';

async function bootstrap() {
    process.env.DEBUG = 'puppeteer-cluster:*';

    const puppeteerVnexDir = path.resolve(process.cwd(), 'accounts', 'puppeteer', 'vnexpress');
    if (!fs.existsSync(puppeteerVnexDir)) {
        fs.mkdirSync(puppeteerVnexDir, { recursive: true });
        fs.mkdirSync(path.resolve(puppeteerVnexDir, EMethod.LIKE.toString()), { recursive: true });
        fs.mkdirSync(path.resolve(puppeteerVnexDir, EMethod.COMMENT.toString()), { recursive: true });
        fs.mkdirSync(path.resolve(puppeteerVnexDir, EMethod.VOTE.toString()), { recursive: true });
    }

    const app = await NestFactory.create<NestExpressApplication>(AppModule);
    app.useBodyParser('text');
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    app.useGlobalFilters(new ExceptionsFilter(app.get(HttpAdapterHost)));

    SwaggerModule.setup('/docs', app, SwaggerModule.createDocument(app, new DocumentBuilder().build()));

    await app.listen(3000);
    const url = new URL('http://localhost:3000/docs');
    console.log(`Server is running at ${url}`);
}
bootstrap();
