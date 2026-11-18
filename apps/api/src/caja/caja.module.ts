import { Global, Module } from '@nestjs/common';
import { CajaController, RecibosController } from './caja.controller';
import { CajaService } from './caja.service';

@Global()
@Module({
  controllers: [CajaController, RecibosController],
  providers: [CajaService],
  exports: [CajaService],
})
export class CajaModule {}
