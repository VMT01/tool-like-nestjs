import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsNumber, IsUrl, Min } from 'class-validator';

import { ApiProperty } from '@nestjs/swagger';

export class VnExpressRequestQuery {
    @ApiProperty({ description: 'Link bài viết cần like' })
    @IsUrl()
    @IsNotEmpty()
    url: string;

    @ApiProperty({ description: 'Số lượng browser sẽ thực thi đồng thời (min: 1)' })
    @Min(1)
    @IsNumber()
    @Transform(({ value }) => Number(value))
    @IsNotEmpty()
    profiles: number;

    @ApiProperty({ description: 'Hiển thị trình duyệt ảo', default: true })
    @IsBoolean()
    @Transform(({ value }) => value === 'true')
    @IsNotEmpty()
    isVisual: boolean;
}
