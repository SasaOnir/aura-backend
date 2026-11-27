import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query, Req, BadRequestException, NotFoundException, ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

/**
 * AuraController — sistema AURA: vote, battles, leaderboard, streaming config, collaborations.
 *
 * VOTE (pubblico, opzionalmente auth):
 *   POST /aura/vote { trackId, value, battleId? }    — vota AURA (+1 like / -1 dislike)
 *   GET  /aura/track/:trackId/votes                  — count AURA del brano
 *
 * LEADERBOARD:
 *   GET /aura/leaderboard?period=week|month|all&limit=20  — top brani per AURA
 *
 * BATTLES:
 *   GET  /aura/battles                                — lista battles (filter status)
 *   GET  /aura/battles/:id                            — dettaglio battle con partecipanti + voti live
 *   POST /aura/battles                                 — crea battle (admin only)
 *   POST /aura/battles/:id/join { trackId }           — artista iscrive brano
 *   POST /aura/battles/:id/close                      — chiude battle, dichiara vincitore (admin)
 *   GET  /aura/battles/:id/leaderboard                — classifica live della battle
 *
 * STREAMING CONFIG (admin only):
 *   GET    /aura/streaming                            — lista connections
 *   POST   /aura/streaming                            — crea connection { name, platform, config, connectedPlaylistId }
 *   PATCH  /aura/streaming/:id                        — aggiorna { status?, config?, connectedPlaylistId? }
 *   DELETE /aura/streaming/:id                        — elimina
 *   POST   /aura/streaming/:id/sync                   — trigger sync mock
 *
 * COLLABORATIONS:
 *   GET  /aura/collaborations                         — proposte ricevute/inviate
 *   POST /aura/collaborations { artistBId, message } — proponi collab
 *   POST /aura/collaborations/:id/accept|reject       — rispondi
 *
 * PUBLIC PROFILE:
 *   GET /aura/u/:publicSlug                           — profilo pubblico artista (no auth)
 */
@Controller('aura')
export class AuraController {
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
    } catch { return null; }
  }
  private requireUser(req: Request): { id: string } {
    const u = this.authUser(req);
    if (!u) throw new BadRequestException('Authentication required');
    return u;
  }
  private async requireAdmin(req: Request): Promise<{ id: string }> {
    const u = this.requireUser(req);
    const admin = await this.prisma.adminAccount.findFirst({ where: { userId: u.id, status: 'active' } });
    if (!admin) throw new ForbiddenException('Admin only');
    return u;
  }
  private fingerprint(req: Request): string {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '0.0.0.0';
    const ua = req.headers['user-agent'] || '';
    return crypto.createHash('sha256').update(ip + '|' + ua).digest('hex');
  }
  private durationToMs(d: string): number {
    if (d === '24h') return 86400_000;
    if (d === '3d') return 3 * 86400_000;
    if (d === '7d') return 7 * 86400_000;
    return 86400_000;
  }

  // ─── VOTE ────────────────────────────────────────────────────────────
  /**
   * POST /aura/vote
   * Body: { trackId, value: 1|-1, battleId? }
   * - User auth: 1 vote per (user, track). Se già votato, aggiorna value.
   * - Guest: 1 vote per (fingerprint, track). Se già votato, aggiorna value.
   * Anti-manipolazione: fingerprint IP+UA hashato, unique index parziale su DB.
   */
  @Post('vote')
  async vote(@Req() req: Request, @Body() body: { trackId: string; value: number; battleId?: string }) {
    if (!body?.trackId) throw new BadRequestException('trackId required');
    if (![1, -1].includes(body.value)) throw new BadRequestException('value must be 1 or -1');
    const track = await this.prisma.track.findUnique({ where: { id: body.trackId } });
    if (!track || track.status !== 'published') throw new NotFoundException('Track not found');

    const user = this.authUser(req);
    const fp = user ? null : this.fingerprint(req);

    if (body.battleId) {
      const b = await this.prisma.battle.findUnique({ where: { id: body.battleId } });
      if (!b) throw new NotFoundException('Battle not found');
      if (b.status !== 'active' && b.status !== 'voting') throw new BadRequestException('Battle not open for voting');
      // check partecipante
      const p = await this.prisma.battleParticipant.findUnique({ where: { battleId_trackId: { battleId: b.id, trackId: body.trackId } } });
      if (!p) throw new BadRequestException('Track not in this battle');
    }

    // Upsert: se esiste già un voto, aggiorna value
    let vote;
    if (user) {
      const existing = await this.prisma.auraVote.findFirst({ where: { trackId: body.trackId, userId: user.id } });
      if (existing) {
        vote = await this.prisma.auraVote.update({ where: { id: existing.id }, data: { auraValue: body.value, battleId: body.battleId || existing.battleId } });
      } else {
        vote = await this.prisma.auraVote.create({
          data: { trackId: body.trackId, userId: user.id, voterFingerprint: null, auraValue: body.value, battleId: body.battleId || null },
        });
      }
    } else {
      const existing = await this.prisma.auraVote.findFirst({ where: { trackId: body.trackId, voterFingerprint: fp } });
      if (existing) {
        vote = await this.prisma.auraVote.update({ where: { id: existing.id }, data: { auraValue: body.value, battleId: body.battleId || existing.battleId } });
      } else {
        vote = await this.prisma.auraVote.create({
          data: { trackId: body.trackId, userId: null, voterFingerprint: fp, auraValue: body.value, battleId: body.battleId || null },
        });
      }
    }
    // Audit log
    await this.prisma.auditLog.create({
      data: {
        actorId: user?.id || null,
        action: 'aura.vote',
        resourceType: 'track',
        resourceId: body.trackId,
        reason: `value=${body.value}${body.battleId ? ',battle=' + body.battleId : ''},fp=${fp?.substring(0, 12) || 'user'}`,
        ip: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || null,
        userAgent: (req.headers['user-agent'] || '').substring(0, 255),
      },
    });
    // Rispondi con count aggiornato
    const auraCount = await this.prisma.auraVote.aggregate({
      where: { trackId: body.trackId, auraValue: 1 }, _sum: { auraValue: true },
    });
    return { ok: true, vote, auraCount: auraCount._sum.auraValue || 0 };
  }

  @Get('track/:trackId/votes')
  async trackVotes(@Param('trackId') trackId: string) {
    const [pos, neg] = await Promise.all([
      this.prisma.auraVote.count({ where: { trackId, auraValue: 1 } }),
      this.prisma.auraVote.count({ where: { trackId, auraValue: -1 } }),
    ]);
    return { trackId, positive: pos, negative: neg, net: pos - neg };
  }

  @Get('me/votes')
  async myVotes(@Req() req: Request, @Query('limit') limit?: string) {
    const u = this.requireUser(req);
    const lim = Math.min(parseInt(limit || '50', 10) || 50, 200);
    const items = await this.prisma.auraVote.findMany({
      where: { userId: u.id },
      take: lim,
      orderBy: { createdAt: 'desc' },
      include: { track: { include: { release: { include: { artist: true } } } } },
    });
    return { items };
  }

  // ─── LEADERBOARD ─────────────────────────────────────────────────────
  @Get('leaderboard')
  async leaderboard(@Query() q: { period?: string; limit?: string; genre?: string }) {
    const period = q.period || 'all';
    const limit = Math.min(parseInt(q.limit || '20', 10) || 20, 50);
    const since = period === 'week' ? new Date(Date.now() - 7 * 86400_000)
      : period === 'month' ? new Date(Date.now() - 30 * 86400_000)
      : new Date(0);
    const votesWhere: Prisma.AuraVoteWhereInput = {
      auraValue: 1, createdAt: { gte: since },
      ...(q.genre ? { track: { trackGenres: { some: { genre: { name: q.genre } } } } } : {}),
    };
    const groups = await this.prisma.auraVote.groupBy({
      by: ['trackId'],
      where: votesWhere,
      _count: { auraValue: true },
      orderBy: { _count: { auraValue: 'desc' } },
      take: limit,
    });
    if (!groups.length) return { items: [], period };
    const trackIds = groups.map((g) => g.trackId);
    const tracks = await this.prisma.track.findMany({
      where: { id: { in: trackIds } },
      include: { release: { include: { artist: true } }, trackGenres: { include: { genre: true } }, _count: { select: { listening: true } } },
    });
    const trackMap = new Map(tracks.map((t) => [t.id, t]));
    const items = groups.map((g) => {
      const t = trackMap.get(g.trackId);
      return {
        ...t,
        genres: (t?.trackGenres || []).map((tg) => tg.genre),
        auraCount: g._count.auraValue,
        plays: t?._count.listening || 0,
      };
    }).filter(Boolean);
    return { items, period };
  }

  // ─── BATTLES ─────────────────────────────────────────────────────────
  @Get('battles')
  async listBattles(@Query('status') status?: string) {
    const where: Prisma.BattleWhereInput = status ? { status } : {};
    const items = await this.prisma.battle.findMany({
      where,
      orderBy: [{ status: 'asc' }, { endAt: 'desc' }],
      include: {
        _count: { select: { participants: true, votes: true } },
        winnerTrack: { include: { release: { include: { artist: true } } } },
      },
    });
    return { items };
  }

  @Get('battles/:id')
  async getBattle(@Param('id') id: string) {
    const b = await this.prisma.battle.findUnique({
      where: { id },
      include: {
        participants: {
          include: {
            track: {
              include: { release: { include: { artist: true } }, _count: { select: { listening: true } } },
            },
          },
        },
        winnerTrack: { include: { release: { include: { artist: true } } } },
      },
    });
    if (!b) throw new NotFoundException('Battle not found');
    // Per ogni partecipante, count AURA netta
    const participantsWithVotes = await Promise.all(
      b.participants.map(async (p) => {
        const [pos, neg] = await Promise.all([
          this.prisma.auraVote.count({ where: { battleId: b.id, trackId: p.trackId, auraValue: 1 } }),
          this.prisma.auraVote.count({ where: { battleId: b.id, trackId: p.trackId, auraValue: -1 } }),
        ]);
        return { ...p, track: { ...p.track, auraPositive: pos, auraNegative: neg, auraNet: pos - neg } };
      }),
    );
    participantsWithVotes.sort((a, b) => b.track.auraNet - a.track.auraNet);
    return { ...b, participants: participantsWithVotes };
  }

  @Post('battles')
  async createBattle(@Req() req: Request, @Body() body: { title: string; description?: string; duration: string; battleType?: string; startAt?: string }) {
    const u = await this.requireAdmin(req);
    if (!body?.title?.trim()) throw new BadRequestException('title required');
    if (!['24h', '3d', '7d'].includes(body.duration || '')) throw new BadRequestException('duration must be 24h|3d|7d');
    const startAt = body.startAt ? new Date(body.startAt) : new Date();
    const endAt = new Date(startAt.getTime() + this.durationToMs(body.duration));
    return this.prisma.battle.create({
      data: {
        title: body.title.trim(),
        description: body.description || null,
        duration: body.duration,
        battleType: body.battleType || 'tracks',
        status: 'active',
        startAt, endAt,
        createdBy: u.id,
      },
    });
  }

  @Post('battles/:id/join')
  async joinBattle(@Req() req: Request, @Param('id') id: string, @Body() body: { trackId: string }) {
    const u = this.requireUser(req);
    if (!body?.trackId) throw new BadRequestException('trackId required');
    const b = await this.prisma.battle.findUnique({ where: { id } });
    if (!b) throw new NotFoundException('Battle not found');
    if (b.status !== 'active') throw new BadRequestException('Battle not accepting participants');
    if (new Date() > b.endAt) throw new BadRequestException('Battle ended');
    // Verifica ownership del track
    const track = await this.prisma.track.findUnique({
      where: { id: body.trackId },
      include: { release: { include: { artist: true } } },
    });
    if (!track || track.status !== 'published') throw new NotFoundException('Track not found or not published');
    const isOwner = track.release.artist.ownerUserId === u.id ||
      !!(await this.prisma.artistMember.findFirst({ where: { artistId: track.release.artistId, userId: u.id } }));
    if (!isOwner) throw new ForbiddenException('Not your track');
    try {
      return await this.prisma.battleParticipant.create({ data: { battleId: id, trackId: body.trackId } });
    } catch (e: any) {
      if (e?.code === 'P2002') return { ok: true, already: true };
      throw e;
    }
  }

  @Post('battles/:id/close')
  async closeBattle(@Req() req: Request, @Param('id') id: string) {
    await this.requireAdmin(req);
    const b = await this.prisma.battle.findUnique({ where: { id } });
    if (!b) throw new NotFoundException('Battle not found');
    // Calcola vincitore (max AURA netta)
    const participants = await this.prisma.battleParticipant.findMany({ where: { battleId: id } });
    let winner: string | null = null;
    let maxNet = -Infinity;
    for (const p of participants) {
      const [pos, neg] = await Promise.all([
        this.prisma.auraVote.count({ where: { battleId: id, trackId: p.trackId, auraValue: 1 } }),
        this.prisma.auraVote.count({ where: { battleId: id, trackId: p.trackId, auraValue: -1 } }),
      ]);
      const net = pos - neg;
      if (net > maxNet) { maxNet = net; winner = p.trackId; }
    }
    return this.prisma.battle.update({
      where: { id },
      data: { status: 'closed', winnerTrackId: winner },
      include: { winnerTrack: { include: { release: { include: { artist: true } } } } },
    });
  }

  @Get('battles/:id/leaderboard')
  async battleLeaderboard(@Param('id') id: string) {
    const b = await this.prisma.battle.findUnique({ where: { id } });
    if (!b) throw new NotFoundException('Battle not found');
    const participants = await this.prisma.battleParticipant.findMany({
      where: { battleId: id },
      include: { track: { include: { release: { include: { artist: true } } } } },
    });
    const withVotes = await Promise.all(
      participants.map(async (p) => {
        const [pos, neg] = await Promise.all([
          this.prisma.auraVote.count({ where: { battleId: id, trackId: p.trackId, auraValue: 1 } }),
          this.prisma.auraVote.count({ where: { battleId: id, trackId: p.trackId, auraValue: -1 } }),
        ]);
        return { ...p, track: { ...p.track, auraPositive: pos, auraNegative: neg, auraNet: pos - neg } };
      }),
    );
    withVotes.sort((a, b) => b.track.auraNet - a.track.auraNet);
    return { battle: b, leaderboard: withVotes };
  }

  // ─── STREAMING CONFIG (admin only) ───────────────────────────────────
  @Get('streaming')
  async listStreaming(@Req() req: Request) {
    await this.requireAdmin(req);
    const items = await this.prisma.streamingConnection.findMany({
      include: { playlist: { include: { _count: { select: { items: true } } } } },
      orderBy: { createdAt: 'desc' },
    });
    return { items };
  }

  @Post('streaming')
  async createStreaming(@Req() req: Request, @Body() body: { name: string; platform: string; config?: any; connectedPlaylistId?: string }) {
    await this.requireAdmin(req);
    if (!body?.name?.trim()) throw new BadRequestException('name required');
    if (!['youtube', 'twitch', 'spotify', 'soundcloud', 'custom'].includes(body.platform || '')) {
      throw new BadRequestException('platform must be youtube|twitch|spotify|soundcloud|custom');
    }
    return this.prisma.streamingConnection.create({
      data: {
        name: body.name.trim(),
        platform: body.platform,
        config: body.config || {},
        connectedPlaylistId: body.connectedPlaylistId || null,
        status: 'active',
      },
    });
  }

  @Patch('streaming/:id')
  async updateStreaming(@Req() req: Request, @Param('id') id: string, @Body() body: { name?: string; status?: string; config?: any; connectedPlaylistId?: string }) {
    await this.requireAdmin(req);
    const data: any = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.status !== undefined) data.status = body.status;
    if (body.config !== undefined) data.config = body.config;
    if (body.connectedPlaylistId !== undefined) data.connectedPlaylistId = body.connectedPlaylistId;
    return this.prisma.streamingConnection.update({ where: { id }, data });
  }

  @Delete('streaming/:id')
  async deleteStreaming(@Req() req: Request, @Param('id') id: string) {
    await this.requireAdmin(req);
    await this.prisma.streamingConnection.delete({ where: { id } });
    return { ok: true };
  }

  @Post('streaming/:id/sync')
  async syncStreaming(@Req() req: Request, @Param('id') id: string) {
    await this.requireAdmin(req);
    const c = await this.prisma.streamingConnection.update({
      where: { id },
      data: { lastSyncAt: new Date(), status: 'active' },
      include: { playlist: { include: { items: { include: { track: true } } } } },
    });
    // Mock sync: conta brani sincronizzati
    const trackCount = c.playlist?.items?.length || 0;
    await this.prisma.auditLog.create({
      data: {
        actorId: (await this.requireAdmin(req)).id,
        action: 'streaming.sync',
        resourceType: 'streaming_connection',
        resourceId: id,
        reason: `platform=${c.platform},tracks=${trackCount}`,
      },
    });
    return { ok: true, syncedTracks: trackCount, lastSyncAt: c.lastSyncAt };
  }

  // ─── COLLABORATIONS ──────────────────────────────────────────────────
  @Get('collaborations')
  async listCollabs(@Req() req: Request) {
    const u = this.requireUser(req);
    const artist = await this.prisma.artist.findFirst({
      where: { OR: [{ ownerUserId: u.id }, { members: { some: { userId: u.id } } }] },
    });
    if (!artist) return { items: [] };
    const items = await this.prisma.collaboration.findMany({
      where: { OR: [{ artistAId: artist.id }, { artistBId: artist.id }] },
      include: { artistA: true, artistB: true, proposer: true },
      orderBy: { createdAt: 'desc' },
    });
    return { items, myArtistId: artist.id };
  }

  @Post('collaborations')
  async proposeCollab(@Req() req: Request, @Body() body: { artistBId: string; message?: string }) {
    const u = this.requireUser(req);
    if (!body?.artistBId) throw new BadRequestException('artistBId required');
    const myArtist = await this.prisma.artist.findFirst({
      where: { OR: [{ ownerUserId: u.id }, { members: { some: { userId: u.id } } }] },
    });
    if (!myArtist) throw new NotFoundException('Create an artist profile first');
    if (myArtist.id === body.artistBId) throw new BadRequestException('Cannot collab with yourself');
    const target = await this.prisma.artist.findUnique({ where: { id: body.artistBId } });
    if (!target) throw new NotFoundException('Target artist not found');
    // Check existing pending
    const existing = await this.prisma.collaboration.findFirst({
      where: {
        OR: [
          { artistAId: myArtist.id, artistBId: body.artistBId, status: 'pending' },
          { artistAId: body.artistBId, artistBId: myArtist.id, status: 'pending' },
        ],
      },
    });
    if (existing) return { ok: true, already: true, existing };
    return this.prisma.collaboration.create({
      data: {
        artistAId: myArtist.id,
        artistBId: body.artistBId,
        proposedBy: u.id,
        message: body.message || null,
        status: 'pending',
      },
    });
  }

  @Post('collaborations/:id/accept')
  async acceptCollab(@Req() req: Request, @Param('id') id: string) {
    const u = this.requireUser(req);
    const collab = await this.prisma.collaboration.findUnique({ where: { id } });
    if (!collab) throw new NotFoundException('Collab not found');
    // Verifica che l'utente sia l'artista B (target)
    const myArtist = await this.prisma.artist.findFirst({
      where: { OR: [{ ownerUserId: u.id }, { members: { some: { userId: u.id } } }] },
    });
    if (!myArtist || (myArtist.id !== collab.artistBId && myArtist.id !== collab.artistAId)) {
      throw new ForbiddenException('Not your collaboration');
    }
    return this.prisma.collaboration.update({ where: { id }, data: { status: 'accepted' } });
  }

  @Post('collaborations/:id/reject')
  async rejectCollab(@Req() req: Request, @Param('id') id: string) {
    const u = this.requireUser(req);
    const collab = await this.prisma.collaboration.findUnique({ where: { id } });
    if (!collab) throw new NotFoundException('Collab not found');
    const myArtist = await this.prisma.artist.findFirst({
      where: { OR: [{ ownerUserId: u.id }, { members: { some: { userId: u.id } } }] },
    });
    if (!myArtist || (myArtist.id !== collab.artistBId && myArtist.id !== collab.artistAId)) {
      throw new ForbiddenException('Not your collaboration');
    }
    return this.prisma.collaboration.update({ where: { id }, data: { status: 'rejected' } });
  }

  // ─── PUBLIC PROFILE ──────────────────────────────────────────────────
  @Get('u/:publicSlug')
  async publicProfile(@Param('publicSlug') publicSlug: string) {
    const artist = await this.prisma.artist.findFirst({
      where: { OR: [{ publicSlug }, { slug: publicSlug }] },
      include: {
        releases: {
          where: { status: 'published' },
          include: {
            tracks: {
              where: { status: 'published' },
              include: {
                trackGenres: { include: { genre: true } },
                _count: { select: { listening: true, auraVotes: true } },
              },
              orderBy: { position: 'asc' },
            },
          },
          orderBy: { releaseDate: 'desc' },
        },
        _count: { select: { follows: true, releases: true } },
      },
    });
    if (!artist) throw new NotFoundException('Artist not found');
    // Top 5 brani per AURA
    const tracks = artist.releases.flatMap((r) => r.tracks);
    const topTracks = tracks
      .map((t) => ({ ...t, genres: (t.trackGenres || []).map((tg) => tg.genre), auraCount: t._count.auraVotes, plays: t._count.listening }))
      .sort((a, b) => b.auraCount - a.auraCount)
      .slice(0, 5);
    return {
      id: artist.id,
      artistName: artist.artistName,
      slug: artist.slug,
      publicSlug: artist.publicSlug,
      biography: artist.biography,
      imageUrl: artist.imageUrl,
      verifiedBadge: artist.verifiedBadge,
      verificationStatus: artist.verificationStatus,
      socialLinks: artist.socialLinks,
      websiteUrl: artist.websiteUrl,
      monthlyListeners: artist.monthlyListeners,
      totalPlays: artist.totalPlays,
      followers: artist._count.follows,
      releasesCount: artist._count.releases,
      topTracks,
      releases: artist.releases.map((r) => ({
        id: r.id, title: r.title, releaseType: r.releaseType, releaseDate: r.releaseDate,
        tracksCount: r.tracks.length,
      })),
    };
  }
}
