import { Module } from '@nestjs/common';
import { MusicController } from './music.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { JwtModule } from '@nestjs/jwt';

/**
 * MusicModule — catalogo pubblico + API listener + API artist.
 * Tutte le rotte sotto /music/*.
 *   Pubbliche (no auth): /music/catalog/tracks, /music/catalog/artists, /music/catalog/genres, /music/catalog/tracks/:id
 *   Listener (auth):     /music/me/playlists, /music/me/follows, /music/me/history, /music/me/play
 *   Artist  (auth):      /music/artist/my-releases, /music/artist/stats, /music/artist/tracks/:id
 */
@Module({
  imports: [PrismaModule, JwtModule.register({})],
  controllers: [MusicController],
})
export class MusicModule {}
