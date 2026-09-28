import { Controller, Delete, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth-user.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { PostView } from '../posts/posts.types.js';
import { ReactionsService } from './reactions.service.js';

const PostId = () => Param('id', new ParseUUIDPipe());

@ApiTags('reactions')
@Controller('posts/:id')
export class ReactionsController {
  constructor(private readonly reactions: ReactionsService) {}

  @Put('like')
  @ApiOperation({ summary: 'Like a post' })
  like(@CurrentUser() user: AuthUser, @PostId() postId: string): Promise<PostView> {
    return this.reactions.add(user.id, postId, 'like');
  }

  @Delete('like')
  @ApiOperation({ summary: 'Unlike a post' })
  unlike(@CurrentUser() user: AuthUser, @PostId() postId: string): Promise<PostView> {
    return this.reactions.remove(user.id, postId, 'like');
  }

  @Put('repost')
  @ApiOperation({ summary: 'Repost a public post' })
  repost(@CurrentUser() user: AuthUser, @PostId() postId: string): Promise<PostView> {
    return this.reactions.add(user.id, postId, 'repost');
  }

  @Delete('repost')
  @ApiOperation({ summary: 'Undo a repost' })
  unrepost(@CurrentUser() user: AuthUser, @PostId() postId: string): Promise<PostView> {
    return this.reactions.remove(user.id, postId, 'repost');
  }
}
