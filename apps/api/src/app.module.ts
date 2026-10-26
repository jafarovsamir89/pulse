import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { AuthController, AuthService, SessionGuard } from './auth';
import { ProfileController } from './profile';
import { MatchController, MatchService } from './match';
import { SafetyController, SafetyService } from './safety';
import { ChatGateway } from './chat.gateway';
import { HealthController } from './health';
import { RedisService } from './redis.service';
import { OriginGuard } from './origin.guard';
import { RealtimeAccess } from './realtime-access';
import { APP_GUARD } from '@nestjs/core';
import { LocalGameController, LocalGameGuard, LocalGameService } from './game/local-game';

@Module({
  controllers: [HealthController, AuthController, ProfileController, MatchController, SafetyController, LocalGameController],
  providers: [PrismaService, RedisService, RealtimeAccess, AuthService, SessionGuard, MatchService, SafetyService, ChatGateway, LocalGameGuard, LocalGameService, { provide: 'CHAT_GATEWAY', useExisting: ChatGateway }, { provide: APP_GUARD, useClass: OriginGuard }],
})
export class AppModule {}
