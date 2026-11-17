import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { contextoBd } from './prisma/contexto-bd';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.setGlobalPrefix('api/v1');
  app.use(cookieParser());
  app.useBodyParser('json', { limit: '1mb' });
  // Cada petición lleva su contexto de base de datos; SesionGuard le pone la empresa (RLS).
  app.use((_req: unknown, _res: unknown, next: () => void) => contextoBd.run({}, next));
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:5175', credentials: true });
  // Detrás de un proxy (Nginx, Railway…) para que req.ip sea la del cliente.
  if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY));
  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? 3002);
  await app.listen(port);
}

void bootstrap();
