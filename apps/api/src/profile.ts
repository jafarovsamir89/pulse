import { Body, Controller, Delete, Get, Patch, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { IsArray, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from './prisma.service';
import { AuthedRequest, SessionGuard } from './auth';
import { RealtimeAccess } from './realtime-access';

class ProfileDto {
  @IsString() @MinLength(2) @MaxLength(32) nickname!: string;
  @IsIn(['ru', 'az', 'en']) language!: string;
  @IsString() @MaxLength(32) avatarPreset!: string;
  @IsOptional() @IsArray() @IsString({ each: true }) interests?: string[];
  @IsIn([true]) acceptRules!: true;
}

@ApiTags('profile')
@Controller('me')
@UseGuards(SessionGuard)
export class ProfileController {
  constructor(private readonly db: PrismaService, private readonly realtime: RealtimeAccess) {}

  @Get()
  async getMe(@Req() req: AuthedRequest) {
    const user = await this.db.user.findUnique({ where: { id: req.userId }, include: { profile: true } });
    if (!user) throw new BadRequestException('Profile unavailable');
    return { id: user.id, profile: user.profile, ageGateStatus: user.ageGateStatus, status: user.status };
  }

  @Patch('profile')
  async updateProfile(@Req() req: AuthedRequest, @Body() body: ProfileDto) {
    if (body.interests && (body.interests.length > 12 || body.interests.some(i => i.length > 24))) throw new BadRequestException('Too many or long interests');
    const profile = await this.db.profile.upsert({
      where: { userId: req.userId! },
      update: { nickname: body.nickname.trim(), language: body.language, avatarPreset: body.avatarPreset, interests: body.interests ?? [], rulesAcceptedAt: new Date() },
      create: { userId: req.userId!, nickname: body.nickname.trim(), language: body.language, avatarPreset: body.avatarPreset, interests: body.interests ?? [], rulesAcceptedAt: new Date() },
    });
    return { profile };
  }

  @Delete()
  async requestDeletion(@Req() req: AuthedRequest) {
    const now = new Date();
    await this.db.$transaction([
      this.db.user.update({ where: { id: req.userId! }, data: { status: 'DELETION_REQUESTED', deletionRequestedAt: now } }),
      this.db.authSession.updateMany({ where: { userId: req.userId!, revokedAt: null }, data: { revokedAt: now } }),
      this.db.activeQueueSlot.deleteMany({ where: { userId: req.userId! } }),
      this.db.activeReservation.deleteMany({ where: { userId: req.userId! } }),
    ]);
    this.realtime.revokeUser(req.userId!);
    return { status: 'deletion_requested' };
  }
}
