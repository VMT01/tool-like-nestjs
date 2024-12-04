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
            'Đường dẫn proxy (có dạng `username:password@host:port` - e.g: proxymart49482:ejlLRrBn@103.15.89.251:49482)',
        required: false,
    })
    @Matches(/^(\w+):(\w+)@([0-9.]+):(\d+)$/g)
    @IsString()
    @IsOptional()
    resetProxy?: string;

    @ApiProperty({ description: 'Tiếp tục từ chunk đã chạy trước đó', required: false, default: false })
    @IsBoolean()
    @Transform(({ value }) => value === 'true')
    @IsOptional()
    continueChunk: boolean;
}
