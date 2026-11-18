import { Module } from '@nestjs/common';
import { AfiliadosController, PlanesController } from './afiliados.controller';
import { AfiliadosService } from './afiliados.service';
import { PlanesService } from './planes.service';

@Module({
  controllers: [PlanesController, AfiliadosController],
  providers: [PlanesService, AfiliadosService],
  exports: [PlanesService, AfiliadosService],
})
export class AfiliadosModule {}
