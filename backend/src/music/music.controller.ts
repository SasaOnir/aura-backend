import {
  Controller, Get, Post, Patch, Body, Param, Query, Req, BadRequestException, NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

/**
 * MusicController — catalogo pubblico + listener + artist + public profile.
 *
 * Pubbliche (no auth):
 *   GET /music/catalog/tracks          — brani pubblicati (paginazione + filtro genere)
 *   GET /music/catalog/tracks/:id      — dettaglio brano
 *   GET /music/catalog/artists         — artisti
 *   GET /music/catalog/artists/:slug   — profilo artista (pubblico)
 *   GET /music/catalog/genres          — generi con count
 *   GET /music/catalog/search?q=       — search brani/artisti/albums
 *
 * Listener (auth):
 *   GET/POST /music/me/playlists, /:id/add, /:id/remove
 *   GET/POST /music/me/follows, /:artistId/unfollow
 *   POST /music/me/play { trackId, eventType, duration }
 *   GET /music/me/history, /music/me/stats
 *
 * Artist (auth):
 *   GET/POST /music/artist/profile
 *   GET /music/artist/my-releases, POST /music/artist/releases, /tracks, /tracks/:id/publish
 *   GET /music/artist/stats
 */
@Controller('music')
export class MusicController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  // ─── Helpers ─────────────────────────────────────────────────────────
  private authUser(req: Request): { id: string } | null {
    const h = req.headers['authorization'] as string | undefined;
    if (!h?.startsWith('Bearer ')) return null;
    try {
      const payload = this.jwt.verify(h.slice(7), {
        secret: process.env.JWT_ACCESS_SECRET || 'dev_access_secret_change_me',
      });
      return { id: payload.sub as string };
    } catch {
      return null;
    }
  }

  private requireUser(req: Request): { id: string } {
    const u = this.authUser(req);
    if (!u) throw new BadRequestException('Authentication required');
    return u;
  }

  // ─── CATALOGO PUBBLICO ────────────────────────────────────────────────

  @Get('catalog/tracks')
  async catalogTracks(@Query() q: { limit?: string; cursor?: string; genre?: string }) {
    const limit = Math.min(parseInt(q.limit || '20', 10) || 20, 50);
    const where: Prisma.TrackWhereInput = { status: 'published' };
    if (q.genre) where.trackGenres = { some: { genre: { name: q.genre } } };
    const items = await this.prisma.track.findMany({
      where,
      take: limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
      include: {
        release: { include: { artist: true } },
        trackGenres: { include: { genre: true } },
        _count: { select: { listening: true, auraVotes: true } },
      },
    });
    const normalized = items.map((t) => ({
      ...t,
      genres: (t.trackGenres || []).map((tg) => tg.genre),
      auraCount: t._count.auraVotes,
    }));
    const nextCursor = items.length > limit ? items[items.length - 1].id : null;
    return { items: normalized.slice(0, limit), nextCursor };
  }

  @Get('catalog/tracks/:id')
  async catalogTrack(@Param('id') id: string) {
    const t = await this.prisma.track.findUnique({
      where: { id },
      include: {
        release: { include: { artist: true } },
        trackGenres: { include: { genre: true } },
        credits: true,
        assets: { where: { assetType: { in: ['preview', 'master'] } } },
        _count: { select: { listening: true, playlistItems: true, auraVotes: true } },
      },
    });
    if (!t || t.status !== 'published') throw new NotFoundException('Track not found');
    return { ...t, genres: (t.trackGenres || []).map((tg) => tg.genre), auraCount: t._count.auraVotes };
  }

  @Get('catalog/artists')
  async catalogArtists(@Query() q: { limit?: string; cursor?: string }) {
    const limit = Math.min(parseInt(q.limit || '20', 10) || 20, 50);
    const items = await this.prisma.artist.findMany({
      take: limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { releases: true, follows: true } } },
    });
    const nextCursor = items.length > limit ? items[items.length - 1].id : null;
    return { items: items.slice(0, limit), nextCursor };
  }

  @Get('catalog/artists/:slug')
  async catalogArtist(@Param('slug') slug: string) {
    const artist = await this.prisma.artist.findFirst({
      where: { OR: [{ slug }, { publicSlug: slug }] },
      include: {
        releases: {
          where: { status: 'published' },
          include: { tracks: { where: { status: 'published' }, orderBy: { position: 'asc' } } },
          orderBy: { releaseDate: 'desc' },
        },
        _count: { select: { follows: true, releases: true } },
      },
    });
    if (!artist) throw new NotFoundException('Artist not found');
    return artist;
  }

  @Get('catalog/genres')
  async catalogGenres() {
    const genres = await this.prisma.genre.findMany({
      include: { _count: { select: { trackGenres: true } } },
      orderBy: { name: 'asc' },
    });
    return genres.map((g) => ({ id: g.id, name: g.name, tracksCount: g._count.trackGenres }));
  }

  @Get('catalog/search')
  async catalogSearch(@Query('q') q: string) {
    const term = (q || '').trim();
    if (term.length < 2) return { tracks: [], artists: [], releases: [] };
    const [tracks, artists, releases] = await Promise.all([
      this.prisma.track.findMany({
        where: { status: 'published', title: { contains: term, mode: 'insensitive' } },
        take: 10,
        include: { release: { include: { artist: true } } },
      }),
      this.prisma.artist.findMany({
        where: { artistName: { contains: term, mode: 'insensitive' } },
        take: 10,
        include: { _count: { select: { follows: true } } },
      }),
      this.prisma.release.findMany({
        where: { status: 'published', title: { contains: term, mode: 'insensitive' } },
        take: 10,
        include: { artist: true },
      }),
    ]);
    return { tracks, artists, releases };
  }

  // ─── LISTENER (auth) ───────────────────────────────────────────────────

  @Get('me/playlists')
  async myPlaylists(@Req() req: Request) {
    const u = this.requireUser(req);
    const items = await this.prisma.playlist.findMany({
      where: { ownerUserId: u.id },
      include: {
        _count: { select: { items: true } },
        streamingConnection: true,
      },
      orderBy: { updatedAt: 'desc' },
    });
    return { items };
  }

  @Post('me/playlists')
  async createPlaylist(@Req() req: Request, @Body() body: { title: string; visibility?: string }) {
    const u = this.requireUser(req);
    if (!body?.title?.trim()) throw new BadRequestException('title required');
    return this.prisma.playlist.create({
      data: {
        ownerUserId: u.id,
        title: body.title.trim(),
        visibility: (body.visibility as any) || 'private',
      },
    });
  }

  @Post('me/playlists/:id/add')
  async addToPlaylist(@Req() req: Request, @Param('id') id: string, @Body() body: { trackId: string; position?: number }) {
    const u = this.requireUser(req);
    const pl = await this.prisma.playlist.findUnique({ where: { id } });
    if (!pl || pl.ownerUserId !== u.id) throw new NotFoundException('Playlist not found');
    const count = await this.prisma.playlistTrack.count({ where: { playlistId: id } });
    return this.prisma.playlistTrack.create({
      data: { playlistId: id, trackId: body.trackId, position: body.position ?? count + 1 },
    });
  }

  @Post('me/playlists/:id/remove')
  async removeFromPlaylist(@Req() req: Request, @Param('id') id: string, @Body() body: { trackId: string }) {
    const u = this.requireUser(req);
    const pl = await this.prisma.playlist.findUnique({ where: { id } });
    if (!pl || pl.ownerUserId !== u.id) throw new NotFoundException('Playlist not found');
    await this.prisma.playlistTrack.delete({ where: { playlistId_trackId: { playlistId: id, trackId: body.trackId } } });
    return { ok: true };
  }

  @Get('me/follows')
  async myFollows(@Req() req: Request) {
    const u = this.requireUser(req);
    const items = await this.prisma.follow.findMany({
      where: { followerUserId: u.id },
      include: { artist: { include: { _count: { select: { follows: true } } } } },
      orderBy: { createdAt: 'desc' },
    });
    return { items: items.map((f) => f.artist) };
  }

  @Post('me/follows')
  async followArtist(@Req() req: Request, @Body() body: { artistId: string }) {
    const u = this.requireUser(req);
    if (!body?.artistId) throw new BadRequestException('artistId required');
    try {
      return await this.prisma.follow.create({ data: { followerUserId: u.id, artistId: body.artistId } });
    } catch (e: any) {
      if (e?.code === 'P2002') return { ok: true, already: true };
      throw e;
    }
  }

  @Post('me/follows/:artistId/unfollow')
  async unfollowArtist(@Req() req: Request, @Param('artistId') artistId: string) {
    const u = this.requireUser(req);
    try {
      await this.prisma.follow.delete({ where: { followerUserId_artistId: { followerUserId: u.id, artistId } } });
    } catch {}
    return { ok: true };
  }

  @Post('me/play')
  async logPlay(
    @Req() req: Request,
    @Body() body: { trackId: string; eventType?: string; duration?: number; source?: string },
  ) {
    const u = this.authUser(req);
    if (!body?.trackId) throw new BadRequestException('trackId required');
    const track = await this.prisma.track.findUnique({ where: { id: body.trackId } });
    if (!track) throw new NotFoundException('track not found');
    const evt = await this.prisma.listeningEvent.create({
      data: {
        userId: u?.id || null,
        trackId: body.trackId,
        startedAt: new Date(),
        endedAt: new Date(),
        qualifiedDuration: body.duration || null,
        source: body.source || 'web',
        eventType: body.eventType || 'play',
      },
    });
    // Incrementa totalPlays artista
    if (track) {
      const rel = await this.prisma.release.findUnique({ where: { id: track.releaseId }, select: { artistId: true } });
      if (rel) await this.prisma.artist.update({ where: { id: rel.artistId }, data: { totalPlays: { increment: 1 } } });
    }
    return { ok: true, id: evt.id };
  }

  @Get('me/history')
  async myHistory(@Req() req: Request, @Query() q: { limit?: string }) {
    const u = this.requireUser(req);
    const limit = Math.min(parseInt(q.limit || '50', 10) || 50, 100);
    const items = await this.prisma.listeningEvent.findMany({
      where: { userId: u.id },
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { track: { include: { release: { include: { artist: true } } } } },
    });
    return { items };
  }

  @Get('me/stats')
  async myStats(@Req() req: Request) {
    const u = this.requireUser(req);
    const [totalPlays, uniqueTracks, playlists, follows] = await Promise.all([
      this.prisma.listeningEvent.count({ where: { userId: u.id } }),
      this.prisma.listeningEvent.groupBy({ by: ['trackId'], where: { userId: u.id }, _count: { trackId: true } }),
      this.prisma.playlist.count({ where: { ownerUserId: u.id } }),
      this.prisma.follow.count({ where: { followerUserId: u.id } }),
    ]);
    const minutesListened = await this.prisma.listeningEvent.aggregate({
      where: { userId: u.id }, _sum: { qualifiedDuration: true },
    });
    return {
      totalPlays,
      uniqueTracks: uniqueTracks.length,
      playlistsCount: playlists,
      followsCount: follows,
      minutesListened: Math.round((minutesListened._sum.qualifiedDuration || 0) / 60),
    };
  }

  // ─── ARTIST (auth + owner) ────────────────────────────────────────────

  @Get('artist/profile')
  async artistProfile(@Req() req: Request) {
    const u = this.requireUser(req);
    const artist = await this.prisma.artist.findFirst({
      where: { OR: [{ ownerUserId: u.id }, { members: { some: { userId: u.id } } }] },
      include: { _count: { select: { releases: true, follows: true } } },
    });
    if (!artist) throw new NotFoundException('No artist profile. Create one first.');
    return artist;
  }

  @Post('artist/profile')
  async createArtistProfile(@Req() req: Request, @Body() body: { artistName: string; biography?: string; publicSlug?: string; socialLinks?: any; websiteUrl?: string }) {
    const u = this.requireUser(req);
    if (!body?.artistName?.trim()) throw new BadRequestException('artistName required');
    const slug = body.artistName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const publicSlug = body.publicSlug?.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || slug;
    const existing = await this.prisma.artist.findFirst({
      where: { OR: [{ ownerUserId: u.id }, { members: { some: { userId: u.id } } }] },
    });
    if (existing) {
      // update social/website se forniti
      return this.prisma.artist.update({
        where: { id: existing.id },
        data: {
          ...(body.socialLinks ? { socialLinks: body.socialLinks } : {}),
          ...(body.websiteUrl !== undefined ? { websiteUrl: body.websiteUrl } : {}),
          ...(body.publicSlug ? { publicSlug } : {}),
        },
      });
    }
    return this.prisma.artist.create({
      data: {
        ownerUserId: u.id,
        artistName: body.artistName.trim(),
        slug,
        publicSlug,
        biography: body.biography || null,
        verificationStatus: 'unverified',
        socialLinks: body.socialLinks || {},
        websiteUrl: body.websiteUrl || null,
      },
    });
  }

  @Get('artist/my-releases')
  async myReleases(@Req() req: Request) {
    const u = this.requireUser(req);
    const artist = await this.prisma.artist.findFirst({
      where: { OR: [{ ownerUserId: u.id }, { members: { some: { userId: u.id } } }] },
    });
    if (!artist) throw new NotFoundException('No artist profile');
    const releases = await this.prisma.release.findMany({
      where: { artistId: artist.id },
      include: { tracks: { include: { _count: { select: { listening: true, auraVotes: true } } }, orderBy: { position: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
    return { artist, releases };
  }

  @Post('artist/releases')
  async createRelease(@Req() req: Request, @Body() body: { title: string; releaseType: string; releaseDate?: string }) {
    const u = this.requireUser(req);
    if (!body?.title?.trim()) throw new BadRequestException('title required');
    if (!['single', 'ep', 'album'].includes(body.releaseType || '')) throw new BadRequestException('releaseType must be single|ep|album');
    const artist = await this.prisma.artist.findFirst({
      where: { OR: [{ ownerUserId: u.id }, { members: { some: { userId: u.id } } }] },
    });
    if (!artist) throw new NotFoundException('Create an artist profile first');
    return this.prisma.release.create({
      data: {
        artistId: artist.id, title: body.title.trim(), releaseType: body.releaseType,
        status: 'draft', releaseDate: body.releaseDate ? new Date(body.releaseDate) : null,
      },
    });
  }

  @Post('artist/tracks')
  async createTrack(@Req() req: Request, @Body() body: { releaseId: string; title: string; duration?: number; position?: number; explicit?: boolean }) {
    const u = this.requireUser(req);
    if (!body?.releaseId || !body?.title?.trim()) throw new BadRequestException('releaseId and title required');
    const release = await this.prisma.release.findUnique({ where: { id: body.releaseId }, include: { artist: true } });
    if (!release) throw new NotFoundException('release not found');
    const isOwner = release.artist.ownerUserId === u.id ||
      !!(await this.prisma.artistMember.findFirst({ where: { artistId: release.artistId, userId: u.id } }));
    if (!isOwner) throw new BadRequestException('Not your release');
    return this.prisma.track.create({
      data: {
        releaseId: body.releaseId, title: body.title.trim(),
        duration: body.duration || null, position: body.position || 1, explicit: body.explicit || false, status: 'draft',
      },
    });
  }

  @Patch('artist/tracks/:id/publish')
  async publishTrack(@Req() req: Request, @Param('id') id: string) {
    const u = this.requireUser(req);
    const track = await this.prisma.track.findUnique({ where: { id }, include: { release: { include: { artist: true } } } });
    if (!track) throw new NotFoundException('track not found');
    const isOwner = track.release.artist.ownerUserId === u.id ||
      !!(await this.prisma.artistMember.findFirst({ where: { artistId: track.release.artistId, userId: u.id } }));
    if (!isOwner) throw new BadRequestException('Not your track');
    return this.prisma.track.update({ where: { id }, data: { status: 'published' } });
  }

  @Get('artist/stats')
  async artistStats(@Req() req: Request) {
    const u = this.requireUser(req);
    const artist = await this.prisma.artist.findFirst({
      where: { OR: [{ ownerUserId: u.id }, { members: { some: { userId: u.id } } }] },
      include: { _count: { select: { follows: true } } },
    });
    if (!artist) throw new NotFoundException('No artist profile');
    const tracks = await this.prisma.track.findMany({ where: { release: { artistId: artist.id } }, select: { id: true } });
    const trackIds = tracks.map((t) => t.id);
    const [totalPlays, plays7d, publishedTracks, releases, auraTotal] = await Promise.all([
      trackIds.length ? this.prisma.listeningEvent.count({ where: { trackId: { in: trackIds } } }) : Promise.resolve(0),
      trackIds.length ? this.prisma.listeningEvent.count({ where: { trackId: { in: trackIds }, createdAt: { gte: new Date(Date.now() - 7 * 86400_000) } } }) : Promise.resolve(0),
      this.prisma.track.count({ where: { release: { artistId: artist.id }, status: 'published' } }),
      this.prisma.release.count({ where: { artistId: artist.id } }),
      trackIds.length ? this.prisma.auraVote.count({ where: { trackId: { in: trackIds }, auraValue: 1 } }) : Promise.resolve(0),
    ]);
    return {
      followers: artist._count.follows,
      totalPlays, plays7d, publishedTracks, releases, auraTotal,
      monthlyListeners: artist.monthlyListeners,
      verifiedBadge: artist.verifiedBadge,
    };
  }
}
