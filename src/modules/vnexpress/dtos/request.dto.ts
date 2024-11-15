import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString, IsUrl, Matches, Min } from 'class-validator';

import { ApiProperty } from '@nestjs/swagger';

export class VnExpressQuery {
    @ApiProperty({ description: 'Link bài viết cần like' })
    @IsUrl()
    @IsNotEmpty()
    url: string;

    @ApiProperty({ description: 'Số lượng browser sẽ thực thi đồng thời (min: 1)' })
    @Min(1)
    @IsNumber()
    @Transform(({ value }) => Number(value))
    @IsNotEmpty()
    browserNum: number;

    @ApiProperty({ description: 'Hiển thị trình duyệt ảo', default: true })
    @IsBoolean()
    @Transform(({ value }) => value === 'true')
    @IsNotEmpty()
    isVisual: boolean = true;

    @ApiProperty({
        description:
            'Đường dẫn proxy (có dạng `host:port:reset_link` - e.g: 27.79.184.38:6001:http://27.79.184.38:60777/reset?proxy=6001)',
        required: false,
    })
    @Matches(/^(\d{1,3}\.){3}\d{1,3}:\d{1,5}:(https?:\/\/.+\/reset\?proxy=\d{1,5})$/g)
    @IsString()
    @IsOptional()
    resetProxy?: string;

    @ApiProperty({ description: 'Tiếp tục từ chunk đã chạy trước đó', required: false, default: false })
    @IsBoolean()
    @Transform(({ value }) => value === 'true')
    @IsOptional()
    continueChunk: boolean;
}
