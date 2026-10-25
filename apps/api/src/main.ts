import 'reflect-metadata';
import dotenv from 'dotenv';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { validateConfig } from './config';

async function bootstrap() {
  dotenv.config();
  dotenv.config({ path: '../../.env', override: false });
  const runtimeConfig = validateConfig();
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.enableCors({ origin: runtimeConfig.webOrigin, credentials: true, methods: ['GET', 'POST', 'PATCH', 'DELETE'] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.setGlobalPrefix('v1');
  const swaggerConfig = new DocumentBuilder().setTitle('PULSE API').setVersion('0.2').addCookieAuth('pulse_session').build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swaggerConfig));
  await app.listen(runtimeConfig.port, '0.0.0.0');
}
void bootstrap();
