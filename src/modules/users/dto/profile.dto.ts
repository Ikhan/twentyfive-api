import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { USERNAME_PATTERN } from '../../../common/validation/username.js';

export const MAX_DISPLAY_NAME = 50;
export const MAX_BIO = 160;

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const lowerTrim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value);
const USERNAME_MESSAGE = 'username must be 3–20 characters: lowercase letters, numbers and _';

export class UpdateProfileDto {
  @ApiPropertyOptional({ maxLength: MAX_DISPLAY_NAME, example: 'Kasun Perera' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_DISPLAY_NAME)
  displayName?: string;

  @ApiPropertyOptional({ example: 'kasun' })
  @IsOptional()
  @Transform(lowerTrim)
  @IsString()
  @Matches(USERNAME_PATTERN, { message: USERNAME_MESSAGE })
  username?: string;

  @ApiPropertyOptional({ maxLength: MAX_BIO })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(MAX_BIO)
  bio?: string;

  @ApiPropertyOptional({ example: 'kandy', description: 'District id' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  hometownId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPrivate?: boolean;
}

/** Standalone (not `extends UpdateProfileDto`): class-validator would inherit @IsOptional on the required fields. */
export class CompleteOnboardingDto {
  @ApiProperty({ maxLength: MAX_DISPLAY_NAME, example: 'Kasun Perera' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_DISPLAY_NAME)
  displayName!: string;

  @ApiProperty({ example: 'kasun' })
  @Transform(lowerTrim)
  @IsString()
  @Matches(USERNAME_PATTERN, { message: USERNAME_MESSAGE })
  username!: string;

  @ApiProperty({ example: 'kandy', description: 'District id' })
  @IsString()
  @IsNotEmpty()
  hometownId!: string;

  @ApiPropertyOptional({ maxLength: MAX_BIO })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(MAX_BIO)
  bio?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPrivate?: boolean;
}

export class UsernameQueryDto {
  @ApiProperty({ example: 'kasun' })
  @Transform(lowerTrim)
  @IsString()
  @MaxLength(50)
  username!: string;
}

export class SetAvatarDto {
  @ApiProperty({ description: 'Id of a completed AVATAR upload (POST /media/uploads → /media/:id/complete)' })
  @IsUUID()
  mediaId!: string;
}

export class SetHeaderDto {
  @ApiProperty({ description: 'Id of a completed HEADER upload (POST /media/uploads → /media/:id/complete)' })
  @IsUUID()
  mediaId!: string;
}

export const DEFAULT_USER_SEARCH = 10;

/** `?q=…&limit=…` for @mention suggestions. */
export class UserSearchQueryDto {
  @ApiPropertyOptional({
    description: 'What was typed after @ (username or name start); empty lists people you follow first',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  q: string = '';

  @ApiPropertyOptional({ minimum: 1, maximum: 20, default: DEFAULT_USER_SEARCH })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit: number = DEFAULT_USER_SEARCH;
}
