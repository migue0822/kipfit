import { Module } from '@nestjs/common';
import {
  RolesController,
  SucursalesController,
  UsuariosController,
} from './administracion.controller';
import { RolesService } from './roles.service';
import { SucursalesService } from './sucursales.service';
import { UsuariosService } from './usuarios.service';

@Module({
  controllers: [UsuariosController, RolesController, SucursalesController],
  providers: [UsuariosService, RolesService, SucursalesService],
  exports: [UsuariosService, RolesService, SucursalesService],
})
export class AdministracionModule {}
