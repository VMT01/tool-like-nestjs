import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString, IsUrl, Min, ValidateIf } from 'class-validator';

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
    isVisual: boolean;

    @ApiProperty({
        description: 'Đường dẫn server proxy (có dạng `host:port` - e.g: 118.70.126.245:5678)',
        required: false,
    })
    @IsString()
    @IsOptional()
    proxyServer: string;

    @ApiProperty({ description: 'Username để xác thực proxy server', required: false })
    @IsString()
    @IsNotEmpty()
    @ValidateIf(req => !!req.proxyServer)
    proxyUsername: string;

    @ApiProperty({ description: 'Password để xác thực proxy server', required: false })
    @IsString()
    @IsNotEmpty()
    @ValidateIf(req => !!req.proxyServer)
    proxyPassword: string;

    @ApiProperty({ description: 'Tiếp tục từ chunk đã chạy trước đó', required: false, default: false })
    @IsBoolean()
    @Transform(({ value }) => value === 'true')
    @IsOptional()
    continueChunk: boolean;
}
