import { Module } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service.js';
import { MediaController } from './media.controller.js';
import { MEDIA_REPOSITORY } from './media.repository.js';
import { MediaService } from './media.service.js';
import { PHOTO_PREVIEWER, SharpPhotoPreviewer } from './photo-preview.js';
import { PrismaMediaRepository } from './prisma-media.repository.js';
import { OBJECT_STORAGE } from './storage/object-storage.js';
import { createObjectStorage } from './storage/storage.factory.js';
import { MediaInfoVideoProbe, VIDEO_PROBE } from './video-probe.js';

@Module({
  controllers: [MediaController],
  providers: [
    MediaService,
    { provide: MEDIA_REPOSITORY, useClass: PrismaMediaRepository },
    { provide: OBJECT_STORAGE, inject: [AppConfigService], useFactory: createObjectStorage },
    { provide: VIDEO_PROBE, useClass: MediaInfoVideoProbe },
    { provide: PHOTO_PREVIEWER, useClass: SharpPhotoPreviewer },
  ],
  exports: [MediaService, OBJECT_STORAGE],
})
export class MediaModule {}
