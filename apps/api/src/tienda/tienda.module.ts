import { Module } from '@nestjs/common';
import { CajaModule } from '../caja/caja.module';
import { VentasService } from './ventas.service';
import { InventarioService } from './inventario.service';
import { InventarioController, ProductosController, VentasController } from './tienda.controller';
import { ProductosService } from './productos.service';

@Module({
  imports: [CajaModule],
  controllers: [ProductosController, InventarioController, VentasController],
  providers: [ProductosService, InventarioService, VentasService],
  exports: [ProductosService, InventarioService],
})
export class TiendaModule {}
