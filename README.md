# Gestióncredifacil

Sistema completo de gestión de créditos con frontend en React y backend en Node.js/Express. Aplicación multi-negocio con roles de administrador y usuarios asignados.

## 🎯 Características Principales

- ✅ **Multi-negocio**: Soporta múltiples negocios independientes
- ✅ **Gestión de clientes**: CRUD completo con búsqueda avanzada
- ✅ **Créditos flexibles**: Diferentes frecuencias de pago (diario, semanal, quincenal, mensual)
- ✅ **Plan de pagos automático**: Generación y recálculo automático
- ✅ **Pagos flexibles**: Permite pagos parciales, completos o adelantados
- ✅ **Gestión de caja**: Control de capital, inyecciones, retiros y proyecciones
- ✅ **Recordatorios automáticos**: Emails de recordatorio de pago
- ✅ **Auditoría completa**: Log de todas las acciones del sistema
- ✅ **PDFs**: Generación de planes de pago y comprobantes
- ✅ **Seguridad OWASP**: Implementación de las mejores prácticas de seguridad

## 🏗️ Arquitectura

```
gestioncredifacil/
├── backend/          # API REST con Node.js + Express + TypeScript
│   ├── src/
│   ├── prisma/       # Schema de base de datos
│   └── package.json
└── frontend/         # SPA con React + Vite + TypeScript
    ├── src/
    ├── public/
    └── package.json
```

## 🚀 Stack Tecnológico

### Backend
- **Node.js** + **Express** - Framework web
- **TypeScript** - Type safety
- **Prisma ORM** - Manejo de base de datos
- **PostgreSQL** (Supabase) - Base de datos
- **JWT** - Autenticación
- **Bcrypt** - Hash de contraseñas
- **Winston** - Logging
- **Helmet** -Seguridad HTTP
- **Express Rate Limit** - Protección contra fuerza bruta

### Frontend
- **React 18** + **Vite** - Framework UI
- **TypeScript** - Type safety
- **React Router** - Navegación
- **Zustand** - State management
- **React Query** - Server state management
- **Axios** - HTTP client
- **Tailwind CSS** - Estilos
- **React Hook Form + Zod** - Validación de formularios
- **jsPDF** - Generación de PDFs
- **Recharts** - Gráficos

## 📋 Requisitos Previos

- Node.js 18+
- npm o yarn
- PostgreSQL (o cuenta en Supabase - gratis)
- Cuenta en Resend (para emails - opcional)

## ⚙️ Instalación

### 1. Clonar el repositorio

```bash
git clone <repository-url>
cd gestioncredifacil
```

### 2. Configurar Base de Datos

**Opción A: Usar Supabase (Recomendado - Gratis)**

1. Crear cuenta en [Supabase](https://supabase.com)
2. Crear un nuevo proyecto
3. Copiar la URL de conexión PostgreSQL

**Opción B: PostgreSQL Local**

```bash
# Instalar PostgreSQL
# Crear base de datos
createdb gestioncredifacil
```

### 3. Configurar Backend

```bash
cd backend

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

# Iniciar servidor
npm run dev
```

El backend estará corriendo en `http://localhost:3000`

### 4. Configurar Frontend

```bash
cd frontend

# Instalar dependencias
npm install

# Copiar variables de entorno
cp .env.example .env

# Iniciar aplicación
npm run dev
```

El frontend estará corriendo en `http://localhost:5173`

## 🔐 Seguridad (OWASP Top 10)

Este proyecto implementa las mejores prácticas de seguridad OWASP:

1. ✅ **Broken Access Control** - RBAC, verificación de ownership
2. ✅ **Cryptographic Failures** - Bcrypt (12 rounds), JWT con expiración, HTTPS
3. ✅ **Injection** - Prisma ORM, validación de entrada, sanitización
4. ✅ **Insecure Design** - Principio de menor privilegio, validación de lógica
5. ✅ **Security Misconfiguration** - Helmet.js, CORS restrictivo, sin stack traces
6. ✅ **Vulnerable Components** - Dependencias actualizadas, npm audit
7. ✅ **Authentication Failures** - Rate limiting, contraseñas fuertes, JWT
8. ✅ **Data Integrity Failures** - Validación doble, integridad referencial
9. ✅ **Security Logging** - Winston, log de auditoría en BD
10. ✅ **SSRF** - Validación de URLs, whitelist de dominios

## 📁 Estructura del Proyecto

### Backend
```
backend/src/
├── config/          # Configuraciones
├── controllers/     # Controladores de rutas
├── middleware/      # Middlewares (auth, validación, etc)
├── routes/          # Rutas de API
├── services/        # Lógica de negocio
├── utils/           # Utilidades (logger, JWT, email)
├── validators/      # Validaciones
└── server.ts        # Entry point
```

### Frontend
```
frontend/src/
├── api/             # Llamadas HTTP
├── components/      # Componentes React
├── layouts/         # Layouts principales
├── pages/           # Páginas/vistas
├── store/           # Zustand stores
├── lib/             # Configuraciones (axios, etc)
├── types/           # TypeScript types
└── App.tsx          # App principal
```

## 🌐 Deployment

### Backend (Railway / Render)
1. Crear cuenta en [Railway](https://railway.app) o [Render](https://render.com)
2. Conectar repositorio de GitHub
3. Configurar variables de entorno
4. Deploy automático

### Frontend (Vercel)
1. Crear cuenta en [Vercel](https://vercel.com)
2. Conectar repositorio de GitHub
3. Configurar variable `VITE_API_URL` con la URL del backend
4. Deploy automático

### Base de Datos (Supabase)
- Ya está en la nube, solo copiar la URL de conexión

## 📚 Documentación

- [Backend README](./backend/README.md)
- [API Documentation](./backend/API.md) (Pendiente)
- [Frontend Guide](./frontend/README.md) (Pendiente)

## 🛣️ Roadmap

- [x] Sistema de autenticación
- [x] Modelo de base de datos
- [x] Middlewares de seguridad
- [x] API base de autenticación
- [ ] CRUD de negocios
- [ ] CRUD de clientes
- [ ] Sistema de créditos completo
- [ ] Sistema de pagos
- [ ] Módulo de caja
- [ ] Dashboard con gráficos
- [ ] Generación de PDFs
- [ ] Sistema de recordatorios
- [ ] Tests automáticos
- [ ] Documentación API completa

## 👥 Roles y Permisos

### Super Admin
- Crear y gestionar negocios
- Asignar usuarios a negocios
- Ver todos los negocios y datos
- Gestionar usuarios

### Usuario de Negocio
- Ver y gestionar solo su negocio asignado
- CRUD de clientes
- CRUD de créditos
- Registrar pagos
- Gestionar caja
- Ver dashboard y reportes

## 📄 Licencia

MIT

## 🤝 Contribución

Las contribuciones son bienvenidas. Por favor:

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📧 Contacto

Para preguntas o soporte, por favor abre un issue en GitHub.

---

**Desarrollado con ❤️ usando las mejores prácticas de desarrollo seguro**
