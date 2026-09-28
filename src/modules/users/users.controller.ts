import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth-user.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { CompleteOnboardingDto, SetAvatarDto, UpdateProfileDto, UsernameQueryDto } from './dto/profile.dto.js';
import { UsersService, type UsernameAvailability } from './users.service.js';
import type { MyProfile, PublicProfile } from './users.types.js';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Your profile' })
  me(@CurrentUser() user: AuthUser): Promise<MyProfile> {
    return this.users.me(user.id);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Edit your profile (Settings)' })
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto): Promise<MyProfile> {
    return this.users.updateProfile(user.id, dto);
  }

  @Put('me/avatar')
  @ApiOperation({ summary: 'Set your profile photo from a completed AVATAR upload' })
  setAvatar(@CurrentUser() user: AuthUser, @Body() dto: SetAvatarDto): Promise<MyProfile> {
    return this.users.setAvatar(user.id, dto.mediaId);
  }

  @Delete('me/avatar')
  @ApiOperation({ summary: 'Remove your profile photo' })
  removeAvatar(@CurrentUser() user: AuthUser): Promise<MyProfile> {
    return this.users.removeAvatar(user.id);
  }

  @Post('me/onboarding')
  @ApiOperation({ summary: 'Finish onboarding: name, username and hometown' })
  onboard(@CurrentUser() user: AuthUser, @Body() dto: CompleteOnboardingDto): Promise<MyProfile> {
    return this.users.completeOnboarding(user.id, dto);
  }

  @Get('username-availability')
  @ApiOperation({ summary: 'Live check for the username field' })
  availability(@CurrentUser() user: AuthUser, @Query() query: UsernameQueryDto): Promise<UsernameAvailability> {
    return this.users.usernameAvailability(query.username, user.id);
  }

  @Get(':username')
  @ApiOperation({ summary: 'Someone’s public profile' })
  profile(@Param('username') username: string): Promise<PublicProfile> {
    return this.users.byUsername(username);
  }
}
