# Gestióncredifacil - Backend API

Backend API para el sistema de gestión de créditos Gestióncredifacil.

## 🚀 Stack Tecnológico

- **Node.js** + **Express** - Framework web
- **TypeScript** - Type safety
- **Prisma ORM** - Manejo de base de datos
- **PostgreSQL** (Supabase) - Base de datos
- **JWT** - Autenticación
- **Bcrypt** - Hash de contraseñas
- **Winston** - Logging
- **Helmet** - Seguridad HTTP
- **Express Rate Limit** - Protección contra fuerza bruta

## 📋 Requisitos

- Node.js 18+ 
- npm o yarn
- PostgreSQL (o cuenta en Supabase)

## ⚙️ Instalación

```bash
# Instalar dependencias
npm install

# Copiar variables de entorno
cp .env.example .env

# Editar .env con tus credenciales
nano .env

# Generar cliente de Prisma
npm run prisma:generate

# Ejecutar migraciones
npm run prisma:migrate

# Iniciar en modo desarrollo
npm run dev
```

## 🔐 Variables de Entorno

Ver archivo `.env.example` para todas las variables necesarias. Las principales son:

- `DATABASE_URL` - URL de conexión a PostgreSQL
- `JWT_SECRET` - Secreto para tokens JWT
- `JWT_REFRESH_SECRET` - Secreto para refresh tokens
- `FRONTEND_URL` - URL del frontend (para CORS)
- `RESEND_API_KEY` - API key de Resend para emails

## 🛡️ Seguridad (OWASP Top 10)

Este backend implementa las mejores prácticas de seguridad OWASP:

- ✅ Control de acceso basado en roles (RBAC)
- ✅ Contraseñas hasheadas con bcrypt (12 rounds)
- ✅ Protección contra SQL Injection (Prisma ORM)
- ✅ Rate limiting en endpoints críticos
- ✅ Headers de seguridad HTTP (Helmet)
- ✅ Tokens JWT con expiración
- ✅ Validación y sanitización de entrada
- ✅ Logging de seguridad completo
- ✅ CORS restrictivo

## 📚 Endpoints Principales

### Autenticación (`/api/auth`)
- `POST /login` - Login con rate limiting
- `POST /refresh` - Renovar access token
- `POST /logout` - Cerrar sesión
- `GET /me` - Usuario actual
- `POST /change-password` - Cambiar contraseña

### Negocios (`/api/businesses`)
### Clientes (`/api/clients`)
### Créditos (`/api/credits`)
### Pagos (`/api/payments`)
### Caja (`/api/cash`)
### Dashboard (`/api/dashboard`)
### Auditoría (`/api/audit`)

## 🧪 Scripts

```bash
npm run dev          # Modo desarrollo con nodemon
npm run build        # Compilar TypeScript
npm run start        # Iniciar en producción
npm run prisma:generate  # Generar cliente Prisma
npm run prisma:migrate   # Ejecutar migraciones
npm run prisma:studio    # Abrir Prisma Studio
```

## 📁 Estructura del Proyecto

```
src/
├── config/          # Configuraciones (BD, env)
├── controllers/     # Controladores de rutas
├── middleware/      # Middlewares (auth, validación, etc)
├── routes/          # Definición de rutas de API
├── services/        # Lógica de negocio
├── utils/           # Utilidades (logger, JWT, cálculos, email)
├── validators/      # Validaciones con express-validator
├── types/           # TypeScript types
└── server.ts        # Entry point
```

## 📝 Licencia

MIT
