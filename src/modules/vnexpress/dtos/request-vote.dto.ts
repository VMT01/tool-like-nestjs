import { Transform } from 'class-transformer';
import { IsNumber, IsOptional } from 'class-validator';

import { ApiProperty } from '@nestjs/swagger';

import { VnExpressQuery } from './request.dto';

export class VnExpressVoteQuery extends VnExpressQuery {
    @ApiProperty({
        description: 'Số vote cần tăng tối đa. Nếu không có giá trị, toàn bộ profile sẽ được sử dụng.',
        required: false,
    })
    @IsNumber()
    @Transform(({ value }) => Number(value))
    @IsOptional()
    voteLimit: number;
}
