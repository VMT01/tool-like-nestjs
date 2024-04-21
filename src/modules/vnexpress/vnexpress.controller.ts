import { Body, Controller, Post, Query, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';

import { VnExpressRequestQuery } from './dtos/request.dto';
import { VnExpressService } from './vnexpress.service';

@Controller('vnexpress')
@ApiTags('VNEXPRESS')
export class VnExpressController {
    constructor(private readonly vnexService: VnExpressService) {}

    @Post('/upload-account')
    @UseInterceptors(FilesInterceptor('files', Infinity, { dest: 'uploads/vnexpress/' }))
    @ApiOperation({ summary: 'Upload VNExpress accounts', description: 'Tải lên danh sách các tài khoản VNExpress' })
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                files: {
                    type: 'array',
                    items: {
                        type: 'string',
                        format: 'binary',
                    },
                },
            },
        },
    })
    uploadAccount() {
        return 'Upload successfully';
    }

    @Post('/like-vnex')
    @ApiOperation({
        summary: 'Like VNExpress comment',
        description: 'Like các comment trên trang VNExpress dựa trên danh sách file cookie cung cấp',
    })
    @ApiConsumes('text/plain')
    likeVnex(@Query() query: VnExpressRequestQuery, @Body() body: string) {
        return this.vnexService.likeVnex(query, body);
    }
}
