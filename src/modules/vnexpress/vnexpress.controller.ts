import { Body, Controller, Post, Query } from '@nestjs/common';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';

import { VnExpressCommentQuery } from './dtos/request-comment.dto';
import { VnExpressLikeQuery } from './dtos/request-like.dto';
import { VnExpressVoteQuery } from './dtos/request-vote.dto';
import { VnExpressQuery } from './dtos/request.dto';
import { VnExpressService } from './vnexpress.service';

@Controller('vnexpress')
@ApiTags('VNEXPRESS')
export class VnExpressController {
    constructor(private readonly vnexService: VnExpressService) {}

    @Post('/like-vnex')
    @ApiOperation({
        summary: 'Like VNExpress comment',
        description: 'Like các comment trên trang VNExpress dựa trên danh sách file cookie cung cấp',
    })
    @ApiConsumes('text/plain')
    likeVnex(@Query() query: VnExpressLikeQuery, @Body() body: string) {
        return this.vnexService.likeVnex(query, body);
    }

    // @Post('/comment-vnex')
    // @ApiOperation({
    //     summary: 'Comment VNExpress',
    //     description: 'Comment trên trang VNExpress dựa trên danh sách file cookie cung cấp',
    // })
    // @ApiConsumes('text/plain')
    // commentVnex(@Query() query: VnExpressCommentQuery, @Body() body: string) {
    //     return this.vnexService.commentVnex(query, body);
    // }

    // @Post('/vote-vnex')
    // @ApiOperation({ summary: 'Vote VNExpress' })
    // @ApiConsumes('text/plain')
    // voteVnex(@Query() query: VnExpressVoteQuery, @Body() body: string) {
    //     return this.vnexService.voteVnex(query, body);
    // }

    // @Post('/test-proxy')
    // testProxy(@Query() query: VnExpressQuery) {
    //     return this.vnexService.testProxy(query);
    // }
}
