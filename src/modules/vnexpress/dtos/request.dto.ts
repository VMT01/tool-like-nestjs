import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsUrl, Min } from 'class-validator';

import { ApiProperty } from '@nestjs/swagger';

export class VnExpressLikeQuery {
    @ApiProperty({ description: 'Link bài viết cần like' })
    @IsUrl()
    @IsNotEmpty()
    url: string;

    @ApiProperty({ description: 'Số lượng browser sẽ thực thi đồng thời (min: 1)' })
    @Min(1)
    @IsNumber()
    @Transform(({ value }) => Number(value))
    @IsNotEmpty()
    profileNum: number;

    @ApiProperty({
        description: 'Số like cần tăng tối đa. Nếu không có giá trị, toàn bộ profile sẽ được sử dụng.',
        required: false,
    })
    @IsNumber()
    @Transform(({ value }) => Number(value))
    @IsOptional()
    likeLimit: number;

    @ApiProperty({ description: 'Hiển thị trình duyệt ảo', default: true })
    @IsBoolean()
    @Transform(({ value }) => value === 'true')
    @IsNotEmpty()
    isVisual: boolean;
}

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
    profileNum: number;

    @ApiProperty({ description: 'Hiển thị trình duyệt ảo', default: true })
    @IsBoolean()
    @Transform(({ value }) => value === 'true')
    @IsNotEmpty()
    isVisual: boolean;
}
