# 📘 Guía de Instalación Paso a Paso - Gestióncredifacil

Esta guía te llevará desde cero hasta tener la aplicación funcionando en tu máquina local.

## ✅ Paso 1: Instalar Node.js y npm

### macOS:

**Opción A - Con Homebrew (Recomendado):**
```bash
# Instalar Homebrew si no lo tienes
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Instalar Node.js (incluye npm)
brew install node

# Verificar instalación
node --version
npm --version
```

**Opción B - Descarga directa:**
1. Visita [nodejs.org](https://nodejs.org/)
2. Descarga la versión LTS (Long Term Support)
3. Ejecuta el instalador
4. Verifica con `node --version` y `npm --version`

## ✅ Paso 2: Crear Cuenta en Supabase (Base de Datos Gratis)

1. Ve a [supabase.com](https://supabase.com)
2. Haz clic en "Start your project"
3. Inicia sesión con GitHub (o crea cuenta)
4. Clic en "New Project"
5. Completa:
   - **Name**: gestioncredifacil
   - **Database Password**: Genera una contraseña segura (guárdala)
   - **Region**: Elige la más cercana a ti
   - **Pricing Plan**: Free (gratis)
6. Espera 1-2 minutos mientras se crea el proyecto
7. Ve a **Settings** → **Database**
8. En "Connection string", copia la URI de **Connection pooling**
9. Reemplaza `[YOUR-PASSWORD]` con tu contraseña

Tu string se verá así:
```
postgresql://postgres.[PROYECTO]:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:5432/postgres
```

## ✅ Paso 3: Configurar el Backend

### 3.1 Navegar al directorio del backend:
```bash
# desde la raíz del proyecto
cd backend
```

### 3.2 Instalar dependencias:
```bash
npm install
```

Esto puede tomar 1-2 minutos.

### 3.3 Configurar variables de entorno:

```bash
# Copiar el archivo de ejemplo
cp .env.example .env

# Editar el archivo .env
nano .env
```

Actualiza estas variables **importantes**:

```env
# Pega aquí tu URL de Supabase
DATABASE_URL="postgresql://postgres.[TU-PROYECTO]:[TU-PASSWORD]@..."

# Genera secretos seguros (puedes usar cualquier string largo y aleatorio)
JWT_SECRET="tu-secreto-super-seguro-jwt-cambiar-en-produccion-123456789"
JWT_REFRESH_SECRET="tu-secreto-refresh-super-seguro-cambiar-en-produccion-987654321"

# Frontend URL (dejar como está para desarrollo local)
FRONTEND_URL="http://localhost:5173"

# Email (opcional - dejar vacío por ahora)
RESEND_API_KEY=""
EMAIL_FROM="noreply@gestioncredifacil.com"

# Environment
NODE_ENV="development"
PORT=3000
```

**Guardar y salir**: `Ctrl + O`, `Enter`, `Ctrl + X`

### 3.4 Generar cliente de Prisma:
```bash
npm run prisma:generate
```

### 3.5 Crear tablas en la base de datos:
```bash
npm run prisma:migrate
```

Cuando te pregunte el nombre de la migración, escribe: `init`

### 3.6 Poblar con datos de prueba:
```bash
npx tsx prisma/seed.ts
```

Verás un resumen con las credenciales de acceso.

### 3.7 Iniciar el servidor backend:
```bash
npm run dev
```

Deberías ver:
```
🚀 Server running on port 3000
📍 Environment: development
🔗 Frontend URL: http://localhost:5173
```

✅ **¡Backend funcionando!** Deja esta terminal abierta.

## ✅ Paso 4: Configurar el Frontend

### 4.1 Abrir una NUEVA terminal y navegar al frontend:
```bash
# desde la raíz del proyecto
cd frontend
```

### 4.2 Instalar dependencias:
```bash
npm install
```

Esto puede tomar 2-3 minutos.

### 4.3 Verificar variables de entorno:

El archivo `.env` ya debe existir con:
```env
VITE_API_URL=http://localhost:3000
```

### 4.4 Iniciar la aplicación:
```bash
npm run dev
```

Verás:
```
VITE v5.x.x  ready in XXX ms

➜  Local:   http://localhost:5173/
```

✅ **¡Frontend funcionando!**

## ✅ Paso 5: Acceder a la Aplicación

1. Abre tu navegador
2. Ve a: **http://localhost:5173**
3. Deberías ver la página de login

### 🔑 Credenciales:

Las contraseñas se definen por entorno (sin valores por defecto):

**Super Administrador:**
- Email: el de `INITIAL_ADMIN_EMAIL` (por defecto `admin@gestioncredifacil.com`)
- Contraseña: la de `SEED_ADMIN_PASSWORD` (en `backend/.env`)

**Usuarios de Negocio (1 y 2):**
- Emails: `usuario1@example.com`, `usuario2@example.com`
- Contraseña: la de `SEED_USER_PASSWORD` (en `backend/.env`)

## 🎉 ¡Listo!

Ya puedes explorar la aplicación. Los datos de prueba incluyen:
- 2 negocios
- 3 clientes
- 1 crédito activo con plan de pagos
- Movimientos de caja

## 🔧 Comandos Útiles

### Backend:
```bash
npm run dev              # Desarrollo con hot-reload
npm run build            # Compilar para producción
npm run start            # Iniciar en producción
npm run prisma:studio    # Abrir interfaz visual de BD
npm run prisma:migrate   # Crear nueva migración
```

### Frontend:
```bash
npm run dev              # Desarrollo con hot-reload
npm run build            # Compilar para producción
npm run preview          # Preview de producción
```

## 🐛 Solución de Problemas

### Error: "Cannot find module '@prisma/client'"
```bash
cd backend
npm run prisma:generate
```

### Error: "Connection refused" en el backend
- Verifica que tu `DATABASE_URL` en `.env` sea correcta
- Verifica que Supabase esté activo

### Error: "Port 3000 already in use"
```bash
# Encuentra y mata el proceso
lsof -ti:3000 | xargs kill -9
```

### Error: "Port 5173 already in use"
```bash
# Encuentra y mata el proceso
lsof -ti:5173 | xargs kill -9
```

### El login no funciona
- Asegúrate de que el backend esté corriendo (http://localhost:3000)
- Verifica que ejecutaste el seed: `npx tsx prisma/seed.ts`
- Revisa la consola del navegador (F12) para errores

## 📚 Próximos Pasos

- Explora el dashboard
- Crea nuevos clientes
- Configura créditos
- Registra pagos
- Revisa los reportes de caja

## 🆘 ¿Necesitas Ayuda?

Si encuentras algún problema:
1. Revisa los logs en la consola donde corre el backend/frontend
2. Abre las DevTools del navegador (F12) y revisa la consola
3. Verifica que todas las dependencias se instalaron correctamente
4. Asegúrate de que ambos servidores estén corriendo

---

**¡Disfruta usando Gestióncredifacil!** 🚀
