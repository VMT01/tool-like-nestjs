import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsNumber, IsUrl, Max, Min } from 'class-validator';

import { ApiProperty } from '@nestjs/swagger';

export class VnExpressRequestQuery {
    @ApiProperty({ description: 'Link bài viết cần like' })
    @IsUrl()
    @IsNotEmpty()
    url: string;

    @ApiProperty({ description: 'Số lượng browser sẽ thực thi đồng thời (min: 1 - max: 10)' })
    @Max(10)
    @Min(1)
    @IsNumber()
    @IsNotEmpty()
    profiles: number;

    @ApiProperty({ description: 'Hiển thị trình duyệt ảo', default: true })
    @IsBoolean()
    @Transform(({ value }) => value === 'true')
    @IsNotEmpty()
    isVisual: boolean;
}
