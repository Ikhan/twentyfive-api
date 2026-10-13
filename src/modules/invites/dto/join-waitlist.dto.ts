import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

export class JoinWaitlistDto {
  @ApiProperty({ maxLength: 50 })
  @IsString()
  @Length(1, 50)
  @Matches(/\S/, { message: 'name must not be blank' })
  name!: string;

  @ApiProperty({ maxLength: 254 })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiPropertyOptional({ description: 'Hometown district id, e.g. "kandy"' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  districtId?: string;
}
