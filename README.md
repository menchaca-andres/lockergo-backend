# LockerGo Backend

API de LockerGo con Node.js, Express, TypeScript, Prisma ORM 7 y PostgreSQL. Bun se usa para instalar dependencias y ejecutar los scripts del proyecto. Prisma obtiene la URL de conexión desde `prisma.config.ts` y conecta al PostgreSQL mediante su driver adapter.

## Requisitos

- Bun 1.3.13 o compatible
- Node.js 22 o superior
- PostgreSQL 16 (disponible con Docker Compose desde la raíz del proyecto)

## Desarrollo local

```bash
bun install
cp .env.example .env
```

Completa en `.env` los secretos JWT y las credenciales iniciales de administrador. Levanta PostgreSQL desde la raíz del repositorio:

```bash
docker compose up -d postgres
```

Aplica las migraciones, crea el primer administrador y levanta la API:

```bash
bun run prisma:generate
bun run prisma:deploy
bun run db:seed
bun run dev
```

El seed no reemplaza ni actualiza cuentas existentes. La API queda disponible en `http://localhost:4000`; comprueba su estado en `/api/health`.
Una vez iniciadas las migraciones, usa `prisma:deploy` o `prisma:migrate`; reserva `prisma:push` para bases descartables.
Si la base ya existe con el esquema anterior (claves primarias llamadas `id`), registra primero la línea base y luego aplica las migraciones:

```bash
bunx prisma migrate resolve --applied 20261014122000_legacy_baseline
bun run prisma:deploy
```

No ejecutes `migrate resolve` en una base nueva; `prisma:deploy` debe crearla desde cero.

### Autenticación

- `POST /api/auth/login`: email y contraseña; responde con el usuario y access token, y establece el refresh token en cookie `httpOnly`.
- `POST /api/auth/refresh`: rota el refresh token y entrega un access token nuevo.
- `POST /api/auth/logout`: revoca el refresh token y elimina la cookie.
- `GET /api/auth/me`: devuelve el usuario autenticado; requiere `Authorization: Bearer <accessToken>`.

## Scripts

- `bun run dev`: servidor de desarrollo con recarga.
- `bun run build`: compila TypeScript en `dist/`.
- `bun run start`: inicia el servidor compilado.
- `bun run typecheck`: comprueba tipos sin emitir archivos.
- `bun run prisma:generate`: genera el cliente Prisma.
- `bun run prisma:push`: sincroniza directamente el esquema; usar solo en bases descartables.
- `bun run prisma:migrate`: crea/aplica una migración de desarrollo.
- `bun run prisma:deploy`: aplica migraciones existentes sin generar cambios.
- `bun run db:seed`: crea el administrador inicial si todavía no existe.
- `bun run test`: ejecuta las pruebas del backend con Bun.