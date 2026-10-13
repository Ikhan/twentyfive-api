import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { AuthUser } from '../../common/auth-user.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { AdminService } from './admin.service.js';
import { JoinWaitlistDto } from './dto/join-waitlist.dto.js';
import type { FlaggedUser, InvitePreview, InviteView, MyInvites, WaitlistView } from './invites.types.js';
import { InvitesService } from './invites.service.js';

/** Looking up codes and joining the waitlist are open to anyone, so they're held to a tighter limit. */
const PUBLIC_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

@ApiTags('invites')
@Controller('invites')
export class InvitesController {
  constructor(private readonly invites: InvitesService) {}

  @Public()
  @Get('status')
  @ApiOperation({ summary: 'Whether sign-up needs an invite right now' })
  status(): { inviteOnly: boolean } {
    return { inviteOnly: this.invites.inviteOnly };
  }

  @Get()
  @ApiOperation({ summary: 'Your invite links, and how many more you can make' })
  mine(@CurrentUser() user: AuthUser): Promise<MyInvites> {
    return this.invites.mine(user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Make a new single-use invite link' })
  create(@CurrentUser() user: AuthUser): Promise<InviteView> {
    return this.invites.create(user.id);
  }

  @Public()
  @Throttle(PUBLIC_THROTTLE)
  @Get(':code')
  @ApiOperation({ summary: 'Who sent an invite, if it can still be used' })
  preview(@Param('code') code: string): Promise<InvitePreview> {
    return this.invites.preview(code);
  }
}

@ApiTags('invites')
@Controller('waitlist')
export class WaitlistController {
  constructor(private readonly invites: InvitesService) {}

  @Public()
  @Throttle(PUBLIC_THROTTLE)
  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: 'Ask for an invite. The same response whether or not the email was already there.' })
  async join(@Body() dto: JoinWaitlistDto): Promise<null> {
    await this.invites.joinWaitlist(dto);
    return null;
  }
}

@ApiTags('admin')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly invites: InvitesService,
    private readonly admin: AdminService,
  ) {}

  @Get('waitlist')
  @ApiOperation({ summary: 'People waiting for an invite (admins)' })
  waitlist(@CurrentUser() user: AuthUser): Promise<WaitlistView[]> {
    return this.invites.waitlist(user.id);
  }

  @Post('waitlist/:id/invite')
  @ApiOperation({ summary: 'Make an invite link for someone on the waitlist (admins)' })
  inviteFromWaitlist(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<InviteView> {
    return this.invites.inviteFromWaitlist(user.id, id);
  }

  @Get('flagged')
  @ApiOperation({ summary: 'Accounts flagged for review, e.g. invited by someone who was banned (admins)' })
  flagged(@CurrentUser() user: AuthUser): Promise<FlaggedUser[]> {
    return this.admin.flagged(user.id);
  }

  @Delete('users/:username/flag')
  @ApiOperation({ summary: 'Clear a flag after review (admins)' })
  clearFlag(@CurrentUser() user: AuthUser, @Param('username') username: string): Promise<null> {
    return this.admin.clearFlag(user.id, username);
  }

  @Put('users/:username/ban')
  @ApiOperation({ summary: 'Ban an account and flag the people they invited (admins)' })
  ban(@CurrentUser() user: AuthUser, @Param('username') username: string): Promise<{ banned: true }> {
    return this.admin.ban(user.id, username);
  }

  @Delete('users/:username/ban')
  @ApiOperation({ summary: 'Lift a ban (admins)' })
  unban(@CurrentUser() user: AuthUser, @Param('username') username: string): Promise<{ banned: false }> {
    return this.admin.unban(user.id, username);
  }
}
