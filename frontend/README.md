# Gestióncredifacil - Frontend

Frontend de la aplicación Gestióncredifacil construido con React + Vite.

## 🚀 Stack Tecnológico

- **React 18** - Librería UI
- **Vite** - Build tool y dev server
- **TypeScript** - Type safety
- **React Router** - Navegación
- **Zustand** - State management
- **React Query** - Server state
- **Axios** - HTTP client
- **Tailwind CSS** - Estilos
- **React Hook Form + Zod** - Formularios
- **jsPDF** - Generación de PDFs
- **Recharts** - Gráficos
- **Lucide React** - Iconos

## ⚙️ Instalación

```bash
# Instalar dependencias
npm install

# Iniciar en modo desarrollo
npm run dev

# Compilar para producción
npm run build

# Preview de producción
npm run preview
```

## 🔧 Configuración

Crear archivo `.env` en la raíz del frontend:

```env
VITE_API_URL=http://localhost:3000
```

En producción, cambiar por la URL de tu backend en Railway/Render.

## 📁 Estructura del Proyecto

```
src/
├── api/              # Funciones de llamadas HTTP
│   ├── auth.ts
│   ├── clients.ts
│   ├── credits.ts
│   └── ...
├── components/       # Componentes React
│   ├── common/       # Componentes reutilizables
│   ├── auth/
│   ├── dashboard/
│   ├── clients/
│   ├── credits/
│   └── ...
├── layouts/          # Layouts de páginas
├── pages/            # Páginas/vistas
├── store/            # Zustand stores
├── lib/              # Configuraciones (axios, etc)
├── types/            # TypeScript types
├── hooks/            # Custom hooks
├── utils/            # Utilidades
└── App.tsx           # Componente principal
```

## 🎨 Sistema de Diseño

### Colores

- **Primary**: Índigo (#4f46e5)
- **Success**: Verde (#22c55e)
- **Danger**: Rojo (#ef4444)

### Fuente

- **Inter** de Google Fonts

### Componentes

Todos los componentes usan Tailwind CSS con clases utilitarias y algunas clases personalizadas definidas en `index.css`.

## 🔐 Autenticación

El frontend maneja autenticación con:
- JWT almacenado en localStorage
- Refresh token automático
- Rutas protegidas con `ProtectedRoute`
- Store de Zustand para estado global de auth

## 📡 API Client

El cliente Axios está configurado en `src/lib/axios.ts` con:
- Interceptores para agregar JWT automáticamente
- Refresh token automático en 401
- Base URL configurable vía environment

## 🧪 Desarrollo

```bash
npm run dev        # Modo desarrollo con HMR
npm run build      # Compilar para producción
npm run preview    # Preview de build de producción
npm run lint       # Ejecutar ESLint
```

## 📦 Build

El comando `npm run build` genera archivos optimizados en la carpeta `dist/` listos para deployment.

## 🌐 Deployment

### Vercel (Recomendado)

 1. Push a GitHub
2. Conectar repositorio en Vercel
3. Configurar:
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Install Command**: `npm install`
4. Agregar variable de entorno:
   - `VITE_API_URL`: URL de tu backend en producción

Deploy automático en cada push.

## 📝 Licencia

MIT
