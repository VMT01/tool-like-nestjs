import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsNumber, IsUrl, Min } from 'class-validator';

import { ApiProperty } from '@nestjs/swagger';

export class VnExpressCommentQuery {
    @ApiProperty({ description: 'Link bài viết cần like' })
    @IsUrl()
    @IsNotEmpty()
    url: string;

    @ApiProperty({ description: 'Số lượng profile sẽ thực thi đồng thời (min: 1)' })
    @Min(1)
    @IsNumber()
    @Transform(({ value }) => Number(value))
    @IsNotEmpty()
    browserNum: number;

    @ApiProperty({ description: 'Hiển thị trình duyệt ảo', default: true })
    @IsBoolean()
    @Transform(({ value }) => value === 'true')
    @IsNotEmpty()
    isVisual: boolean;
}
