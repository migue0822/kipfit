import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SesionGuard } from './sesion.guard';
import { SesionesService } from './sesiones.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, SesionesService, { provide: APP_GUARD, useClass: SesionGuard }],
  exports: [SesionesService],
})
export class AuthModule {}
