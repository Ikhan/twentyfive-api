import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Paginated } from '../../common/api-response.js';
import type { AuthUser } from '../../common/auth-user.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { PageQueryDto } from '../../common/pagination/page-query.dto.js';
import { CommentsService } from './comments.service.js';
import type { CommentView } from './comments.types.js';
import { CreateCommentDto } from './dto/comment.dto.js';

@ApiTags('comments')
@Controller()
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Get('posts/:id/comments')
  @ApiOperation({ summary: 'Top-level comments on a post, oldest first, each with its reply count' })
  list(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) postId: string,
    @Query() page: PageQueryDto,
  ): Promise<Paginated<CommentView>> {
    return this.comments.list(user.id, postId, page);
  }

  @Post('posts/:id/comments')
  @ApiOperation({ summary: 'Comment on a post, or reply to one of its comments with parentId' })
  add(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) postId: string,
    @Body() dto: CreateCommentDto,
  ): Promise<CommentView> {
    return this.comments.add(user.id, postId, dto.body, dto.parentId, { mediaIds: dto.mediaIds, videoId: dto.videoId });
  }

  @Get('comments/:id/replies')
  @ApiOperation({ summary: 'Replies to a comment, oldest first' })
  replies(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) commentId: string,
    @Query() page: PageQueryDto,
  ): Promise<Paginated<CommentView>> {
    return this.comments.replies(user.id, commentId, page);
  }

  @Put('comments/:id/like')
  @ApiOperation({ summary: 'Like a comment or reply' })
  like(@CurrentUser() user: AuthUser, @Param('id', new ParseUUIDPipe()) id: string): Promise<CommentView> {
    return this.comments.like(user.id, id, true);
  }

  @Delete('comments/:id/like')
  @ApiOperation({ summary: 'Unlike a comment or reply' })
  unlike(@CurrentUser() user: AuthUser, @Param('id', new ParseUUIDPipe()) id: string): Promise<CommentView> {
    return this.comments.like(user.id, id, false);
  }

  @Delete('comments/:id')
  @HttpCode(200)
  @ApiOperation({ summary: 'Delete a comment (its author or the post’s author)' })
  async remove(@CurrentUser() user: AuthUser, @Param('id', new ParseUUIDPipe()) id: string): Promise<null> {
    await this.comments.remove(user.id, id);
    return null;
  }
}
