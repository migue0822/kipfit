import { Module } from '@nestjs/common';
import { InventarioService } from './inventario.service';
import { InventarioController, ProductosController } from './tienda.controller';
import { ProductosService } from './productos.service';

@Module({
  controllers: [ProductosController, InventarioController],
  providers: [ProductosService, InventarioService],
  exports: [ProductosService, InventarioService],
})
export class TiendaModule {}
