import { Transform } from 'class-transformer';
import { IsNumber, IsOptional } from 'class-validator';

import { ApiProperty } from '@nestjs/swagger';

import { VnExpressQuery } from './request.dto';

export class VnExpressLikeQuery extends VnExpressQuery {
    @ApiProperty({
        description: 'Số like cần tăng tối đa. Nếu không có giá trị, toàn bộ profile sẽ được sử dụng.',
        required: false,
    })
    @IsNumber()
    @Transform(({ value }) => Number(value))
    @IsOptional()
    likeLimit: number;
}
