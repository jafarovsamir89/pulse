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
import { APP_GUARD } from '@nestjs/core';

@Module({
  controllers: [HealthController, AuthController, ProfileController, MatchController, SafetyController],
  providers: [PrismaService, RedisService, AuthService, SessionGuard, MatchService, SafetyService, ChatGateway, { provide: 'CHAT_GATEWAY', useExisting: ChatGateway }, { provide: APP_GUARD, useClass: OriginGuard }],
})
export class AppModule {}
