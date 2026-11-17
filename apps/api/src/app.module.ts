import { Module } from '@nestjs/common';
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
    EmpresaModule,
  ],
})
export class AppModule {}
