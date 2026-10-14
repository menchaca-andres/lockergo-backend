# LockerGo Backend

API de LockerGo con Node.js, Express, TypeScript, Prisma y PostgreSQL. Bun se usa para instalar dependencias y ejecutar los scripts del proyecto.

## Requisitos

- Bun 1.3.13 o compatible
- Node.js 22 o superior
- PostgreSQL 16 (disponible con Docker Compose desde la raíz del proyecto)

## Desarrollo local

```bash
bun install
cp .env.example .env
bun run dev
```

Levanta PostgreSQL desde la raíz del repositorio:

```bash
docker compose up -d postgres
```

Genera el cliente Prisma y aplica el esquema a la base local:

```bash
bun run prisma:generate
bun run prisma:push
```

La API queda disponible en `http://localhost:4000`. Comprueba su estado en `/api/health`.

## Scripts

- `bun run dev`: servidor de desarrollo con recarga.
- `bun run build`: compila TypeScript en `dist/`.
- `bun run start`: inicia el servidor compilado.
- `bun run typecheck`: comprueba tipos sin emitir archivos.
- `bun run prisma:generate`: genera el cliente Prisma.
- `bun run prisma:push`: sincroniza el esquema local con la base de datos.
- `bun run prisma:migrate`: crea/aplica una migración de desarrollo.