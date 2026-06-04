# 🚀 Quick Start - Gestióncredifacil

¿Primera vez usando Gestióncredifacil? Sigue esta guía rápida.

## Opción 1: Script Automatizado (Recomendado)

Si ya tienes Node.js instalado:

```bash
# Dar permisos de ejecución al script
chmod +x setup.sh

# Ejecutar el script de configuración
./setup.sh
```

El script automáticamente:
- ✅ Verifica dependencias
- ✅ Instala paquetes npm
- ✅ Configura archivos .env
- ✅ Ejecuta migraciones
- ✅ Crea datos de prueba

⚠️ **Importante**: Cuando el script te lo pida, debes configurar tu `DATABASE_URL` de Supabase en `backend/.env`

## Opción 2: Configuración Manual

Si prefieres hacerlo paso a paso, sigue la guía completa: [GUIA_INSTALACION.md](./GUIA_INSTALACION.md)

## 📱 Iniciar la Aplicación

Una vez configurado, necesitas 2 terminales:

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

Luego abre: **http://localhost:5173**

## 🔑 Login

Las contraseñas de los usuarios semilla se definen por variables de entorno
(`SEED_ADMIN_PASSWORD`, `SEED_USER_PASSWORD` en `backend/.env`); **no hay
contraseñas por defecto**. Entra con el email del admin inicial
(`INITIAL_ADMIN_EMAIL`, por defecto `admin@gestioncredifacil.com`) y la contraseña
que hayas configurado.

| Usuario | Email | Contraseña |
|---------|-------|------------|
| Super Admin | `INITIAL_ADMIN_EMAIL` | `SEED_ADMIN_PASSWORD` |
| Usuario 1 | usuario1@example.com | `SEED_USER_PASSWORD` |
| Usuario 2 | usuario2@example.com | `SEED_USER_PASSWORD` |

## 📚 Documentación Completa

- [Guía de Instalación Detallada](./GUIA_INSTALACION.md)
- [README Principal](./README.md)
- [Plan de Implementación](./implementation_plan.md)

## 🆘 ¿Problemas?

Consulta la sección de "Solución de Problemas" en [GUIA_INSTALACION.md](./GUIA_INSTALACION.md)

---

**¡Listo para empezar!** 🎉
