import { Body, Controller, Post, Query } from '@nestjs/common';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';

import { VnExpressCommentQuery, VnExpressLikeQuery } from './dtos/request.dto';
import { VnExpressService } from './vnexpress.service';

@Controller('vnexpress')
@ApiTags('VNEXPRESS')
export class VnExpressController {
    constructor(private readonly vnexService: VnExpressService) { }

    @Post('/like-vnex')
    @ApiOperation({
        summary: 'Like VNExpress comment',
        description: 'Like các comment trên trang VNExpress dựa trên danh sách file cookie cung cấp',
    })
    @ApiConsumes('text/plain')
    likeVnex(@Query() query: VnExpressLikeQuery, @Body() body: string) {
        return this.vnexService.likeVnex(query, body);
    }

    @Post('/comment-vnex')
    @ApiOperation({
        summary: 'Comment VNExpress',
        description: 'Comment trên trang VNExpress dựa trên danh sách file cookie cung cấp',
    })
    @ApiConsumes('text/plain')
    commentVnex(@Query() query: VnExpressCommentQuery, @Body() body: string) {
        return this.vnexService.commentVnex(query, body);
    }
}
