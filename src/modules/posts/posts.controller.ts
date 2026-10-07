import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Paginated } from '../../common/api-response.js';
import type { AuthUser } from '../../common/auth-user.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { PageQueryDto } from '../../common/pagination/page-query.dto.js';
import { CreatePostDto, FeedQueryDto } from './dto/posts.dto.js';
import { PostsService } from './posts.service.js';
import type { PostView } from './posts.types.js';

@ApiTags('posts')
@Controller()
export class PostsController {
  constructor(private readonly posts: PostsService) {}

  @Post('posts')
  @ApiOperation({ summary: 'Create a post (text and/or up to 4 photos) about a district' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePostDto): Promise<PostView> {
    return this.posts.create(user.id, dto);
  }

  @Get('posts/:id')
  @ApiOperation({ summary: 'One post (if you’re allowed to see it)' })
  get(@CurrentUser() user: AuthUser, @Param('id', new ParseUUIDPipe()) id: string): Promise<PostView> {
    return this.posts.get(id, user.id);
  }

  @Delete('posts/:id')
  @HttpCode(200)
  @ApiOperation({ summary: 'Delete your post' })
  async remove(@CurrentUser() user: AuthUser, @Param('id', new ParseUUIDPipe()) id: string): Promise<null> {
    await this.posts.delete(id, user.id);
    return null;
  }

  @Get('feed')
  @ApiOperation({ summary: 'Home feed: For you (everything you can see) or Following (people, districts, you)' })
  feed(@CurrentUser() user: AuthUser, @Query() query: FeedQueryDto): Promise<Paginated<PostView>> {
    return this.posts.feed(user.id, query.tab, query);
  }

  @Get('districts/:id/posts')
  @ApiOperation({ summary: 'Posts about a district' })
  byDistrict(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query() page: PageQueryDto,
  ): Promise<Paginated<PostView>> {
    return this.posts.byDistrict(user.id, id, page);
  }

  @Get('users/me/likes')
  @ApiOperation({ summary: 'Posts you liked (only ever yours: likes are private)' })
  myLikes(@CurrentUser() user: AuthUser, @Query() page: PageQueryDto): Promise<Paginated<PostView>> {
    return this.posts.myLikes(user.id, page);
  }

  @Get('users/me/media')
  @ApiOperation({ summary: 'Your posts with photos or a video (only ever yours)' })
  myMedia(@CurrentUser() user: AuthUser, @Query() page: PageQueryDto): Promise<Paginated<PostView>> {
    return this.posts.myMedia(user.id, page);
  }

  @Get('users/:username/posts')
  @ApiOperation({ summary: 'A profile’s posts (private accounts: followers only)' })
  byAuthor(
    @CurrentUser() user: AuthUser,
    @Param('username') username: string,
    @Query() page: PageQueryDto,
  ): Promise<Paginated<PostView>> {
    return this.posts.byAuthor(user.id, username, page);
  }
}
