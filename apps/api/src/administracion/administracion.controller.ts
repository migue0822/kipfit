import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put } from '@nestjs/common';
import {
  cambiarEstadoSchema,
  PERMISOS,
  restablecerPasswordSchema,
  rolSchema,
  sucursalSchema,
  usuarioEdicionSchema,
  usuarioNuevoSchema,
  type CambiarEstado,
  type RestablecerPasswordDatos,
  type RolDatos,
  type SucursalDatos,
  type UsuarioEdicionDatos,
  type UsuarioNuevoDatos,
} from '@kip/shared';
import type { ContextoEmpresa } from '../auth/contexto';
import { Contexto, RequierePermiso } from '../auth/decoradores';
import { IdPipe } from '../comun/pipes';
import { ZodPipe } from '../comun/zod.pipe';
import { RolesService } from './roles.service';
import { SucursalesService } from './sucursales.service';
import { UsuariosService } from './usuarios.service';

const estado = new ZodPipe(cambiarEstadoSchema);

@Controller('usuarios')
@RequierePermiso(PERMISOS.USUARIOS_GESTIONAR)
export class UsuariosController {
  constructor(private readonly usuarios: UsuariosService) {}

  @Get()
  listar(@Contexto() ctx: ContextoEmpresa) {
    return this.usuarios.listar(ctx);
  }

  @Post()
  crear(
    @Contexto() ctx: ContextoEmpresa,
    @Body(new ZodPipe(usuarioNuevoSchema)) d: UsuarioNuevoDatos,
  ) {
    return this.usuarios.crear(ctx, d);
  }

  /** PUT /api/v1/usuarios/:id { rolId, sucursalIds } — :id es el id del usuario. */
  @Put(':id')
  editar(
    @Contexto() ctx: ContextoEmpresa,
    @Param('id', IdPipe) id: string,
    @Body(new ZodPipe(usuarioEdicionSchema)) d: UsuarioEdicionDatos,
  ) {
    return this.usuarios.editar(ctx, id, d);
  }

  @Patch(':id/estado')
  cambiarEstado(
    @Contexto() ctx: ContextoEmpresa,
    @Param('id', IdPipe) id: string,
    @Body(estado) d: CambiarEstado,
  ) {
    return this.usuarios.cambiarEstado(ctx, id, d);
  }

  @Post(':id/password')
  @HttpCode(204)
  async restablecer(
    @Contexto() ctx: ContextoEmpresa,
    @Param('id', IdPipe) id: string,
    @Body(new ZodPipe(restablecerPasswordSchema)) d: RestablecerPasswordDatos,
  ) {
    await this.usuarios.restablecerPassword(ctx, id, d);
  }
}

@Controller('roles')
@RequierePermiso(PERMISOS.USUARIOS_GESTIONAR)
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  listar(@Contexto() ctx: ContextoEmpresa) {
    return this.roles.listar(ctx);
  }

  @Post()
  crear(@Contexto() ctx: ContextoEmpresa, @Body(new ZodPipe(rolSchema)) d: RolDatos) {
    return this.roles.crear(ctx, d);
  }

  @Put(':id')
  editar(
    @Contexto() ctx: ContextoEmpresa,
    @Param('id', IdPipe) id: string,
    @Body(new ZodPipe(rolSchema)) d: RolDatos,
  ) {
    return this.roles.editar(ctx, id, d);
  }

  @Patch(':id/estado')
  cambiarEstado(
    @Contexto() ctx: ContextoEmpresa,
    @Param('id', IdPipe) id: string,
    @Body(estado) d: CambiarEstado,
  ) {
    return this.roles.cambiarEstado(ctx, id, d);
  }
}

@Controller('sucursales')
@RequierePermiso(PERMISOS.SUCURSALES_GESTIONAR)
export class SucursalesController {
  constructor(private readonly sucursales: SucursalesService) {}

  @Get()
  listar(@Contexto() ctx: ContextoEmpresa) {
    return this.sucursales.listar(ctx);
  }

  @Post()
  crear(@Contexto() ctx: ContextoEmpresa, @Body(new ZodPipe(sucursalSchema)) d: SucursalDatos) {
    return this.sucursales.crear(ctx, d);
  }

  @Put(':id')
  editar(
    @Contexto() ctx: ContextoEmpresa,
    @Param('id', IdPipe) id: string,
    @Body(new ZodPipe(sucursalSchema)) d: SucursalDatos,
  ) {
    return this.sucursales.editar(ctx, id, d);
  }

  @Patch(':id/estado')
  cambiarEstado(
    @Contexto() ctx: ContextoEmpresa,
    @Param('id', IdPipe) id: string,
    @Body(estado) d: CambiarEstado,
  ) {
    return this.sucursales.cambiarEstado(ctx, id, d);
  }
}
