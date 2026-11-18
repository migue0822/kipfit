import { Module } from '@nestjs/common';
import { AfiliadosModule } from './afiliados/afiliados.module';
import { TiendaModule } from './tienda/tienda.module';
import { InformesModule } from './informes/informes.module';
import { CajaModule } from './caja/caja.module';
import { IngresosModule } from './ingresos/ingresos.module';
import { AdministracionModule } from './administracion/administracion.module';
import { AuthModule } from './auth/auth.module';
import { EmpresaModule } from './empresa/empresa.module';
import { PlataformaModule } from './plataforma/plataforma.module';
import { PrismaModule } from './prisma/prisma.module';
import { SaludModule } from './salud/salud.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    SaludModule,
    PlataformaModule,
    AdministracionModule,
    AfiliadosModule,
    IngresosModule,
    CajaModule,
    InformesModule,
    TiendaModule,
    EmpresaModule,
  ],
})
export class AppModule {}
