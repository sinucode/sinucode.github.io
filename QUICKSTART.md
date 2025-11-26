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

Usa cualquiera de estas credenciales:

| Usuario | Email | Contraseña |
|---------|-------|------------|
| Super Admin | admin@gestioncredifacil.com | Admin123! |
| Usuario 1 | usuario1@example.com | Usuario123! |
| Usuario 2 | usuario2@example.com | Usuario123! |

## 📚 Documentación Completa

- [Guía de Instalación Detallada](./GUIA_INSTALACION.md)
- [README Principal](./README.md)
- [Plan de Implementación](./implementation_plan.md)

## 🆘 ¿Problemas?

Consulta la sección de "Solución de Problemas" en [GUIA_INSTALACION.md](./GUIA_INSTALACION.md)

---

**¡Listo para empezar!** 🎉
