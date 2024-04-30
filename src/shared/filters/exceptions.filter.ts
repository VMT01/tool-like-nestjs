import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

@Catch()
export class ExceptionsFilter implements ExceptionFilter {
    constructor(private readonly httpAdapterHost: HttpAdapterHost) { }

    catch(exception: unknown, host: ArgumentsHost): void {
        console.log('[ERROR - exceptions.filter.ts:9]', exception);

        // In certain situations `httpAdapter` might not be available in the
        // constructor method, thus we should resolve it here.
        const { httpAdapter } = this.httpAdapterHost;

        const ctx = host.switchToHttp();

        const responseBody =
            exception instanceof HttpException
                ? {
                    statusCode: exception.getStatus(),
                    response: exception.getResponse(),
                }
                : {
                    statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
                    response: (exception as Error).message,
                };

        httpAdapter.reply(ctx.getResponse(), responseBody, responseBody.statusCode);
    }
}
