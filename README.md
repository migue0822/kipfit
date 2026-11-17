# Kipfit

Gestión web de gimnasios (familia KIPU): afiliados, planes y control de ingreso en la entrada con tablet.
Multi-empresa y multi-sucursal. Etapa 0: base (autenticación, empresas, sucursales, usuarios, roles, RLS y licencias).

## Requisitos

- Node.js 22.12 o superior
- pnpm 10 (`corepack enable`)
- Docker (para PostgreSQL en desarrollo)

## Arranque

Con Docker Desktop abierto:

```bash
pnpm install
pnpm db:up
cp .env.example apps/api/.env      # en Windows (PowerShell/CMD): copy .env.example apps\api\.env
pnpm --filter @kip/api db:migrate
pnpm dev
```

- Web: http://localhost:5175 (en "Registrarla" se crea la primera empresa)
- API: http://localhost:3002/api/v1/salud

Los puertos (5434 para la base, 3002 y 5175) son distintos a los de OrdenKipu, así los dos pueden
correr al mismo tiempo.

## Estructura

```
apps/
  api/        NestJS + Prisma (PostgreSQL)
  web/        React + Vite + Tailwind
packages/
  shared/     Esquemas Zod y utilidades compartidas
```

Las reglas de diseño y código están en [CLAUDE.md](CLAUDE.md).
