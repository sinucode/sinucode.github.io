# 🐳 Guía de Uso con Docker

Esta guía te permite ejecutar **Gestióncredifacil** usando Docker, sin necesidad de instalar Node.js en tu máquina local.

## ✅ Requisitos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) instalado y corriendo.

## 🚀 Pasos para Iniciar

### 1. Configurar Variables de Entorno

Asegúrate de configurar tu conexión a Supabase en el archivo `.env` del backend:

1. Copia el ejemplo si no existe:
   ```bash
   cp backend/.env.example backend/.env
   ```
2. Edita `backend/.env` y pon tu `DATABASE_URL` real de Supabase.

### 2. Iniciar la Aplicación

En la raíz del proyecto (donde está `docker-compose.yml`), ejecuta:

```bash
docker-compose up --build
```

Esto hará automáticamente:
1. Construir las imágenes de backend y frontend.
2. Instalar dependencias dentro de los contenedores.
3. Ejecutar migraciones de base de datos (Prisma).
4. Iniciar los servidores de desarrollo.

### 3. Acceder a la App

- **Frontend:** [http://localhost:5173](http://localhost:5173)
- **Backend API:** [http://localhost:3000](http://localhost:3000)

## 🛠️ Comandos Útiles

**Detener los contenedores:**
Presiona `Ctrl + C` en la terminal o ejecuta:
```bash
docker-compose down
```

**Reiniciar y reconstruir (si agregas nuevas dependencias):**
```bash
docker-compose up --build
```

**Ver logs:**
```bash
docker-compose logs -f
```

**Ejecutar un comando dentro del contenedor (ej. Seed de base de datos):**
```bash
# Abrir terminal en el backend
docker-compose exec backend sh

# Ejecutar seed (dentro del contenedor)
npm run prisma:seed
```

## 🐛 Solución de Problemas Comunes

**Error de conexión a base de datos:**
Asegúrate de que la `DATABASE_URL` en `backend/.env` es correcta y accesible desde internet (Supabase lo es).

**Puertos ocupados:**
Si obtienes error "Bind for 0.0.0.0:3000 failed", asegúrate de no tener otro proceso usando el puerto 3000 o 5173.
