#!/bin/bash

# Script de configuración rápida para Gestióncredifacil
# Este script automatiza la configuración inicial del proyecto

set -e  # Salir si hay algún error

echo "🚀 Iniciando configuración de Gestióncredifacil..."

# Colores para output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Función para imprimir mensajes
print_message() {
    echo -e "${GREEN}✓${NC} $1"
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Verificar Node.js
print_info "Verificando Node.js..."
if ! command -v node &> /dev/null; then
    print_error "Node.js no está instalado"
    print_info "Por favor instala Node.js desde https://nodejs.org/"
    exit 1
fi  
print_message "Node.js $(node --version) encontrado"

# Verificar npm
if ! command -v npm &> /dev/null; then
    print_error "npm no está instalado"
    exit 1
fi
print_message "npm $(npm --version) encontrado"

# Configurar Backend
print_info "Configurando Backend..."
cd backend

# Instalar dependencias del backend
print_info "Instalando dependencias del backend..."
npm install

# Verificar archivo .env
if [ ! -f .env ]; then
    print_warning "Archivo .env no encontrado"
    print_info "Copiando .env.example a .env..."
    cp .env.example .env
    print_warning "⚠️  IMPORTANTE: Debes editar backend/.env con tu DATABASE_URL de Supabase"
    print_info "Presiona Enter cuando hayas configurado el DATABASE_URL..."
    read
fi

# Generar cliente de Prisma
print_info "Generando cliente de Prisma..."
npm run prisma:generate

# Ejecutar migraciones
print_info "Ejecutando migraciones de base de datos..."
npm run prisma:migrate

# Ejecutar seed
print_info "Poblando base de datos con datos de prueba..."
npm run prisma:seed

print_message "Backend configurado exitosamente"

# Volver al directorio raíz
cd ..

# Configurar Frontend
print_info "Configurando Frontend..."
cd frontend

# Verificar archivo .env
if [ ! -f .env ]; then
    print_info "Creando archivo .env para frontend..."
    echo "VITE_API_URL=http://localhost:3000" > .env
fi

# Instalar dependencias del frontend
print_info "Instalando dependencias del frontend..."
npm install

print_message "Frontend configurado exitosamente"

# Volver al directorio raíz
cd ..

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}     ¡Configuración completada exitosamente! 🎉    ${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
echo ""
echo -e "${BLUE}Para iniciar la aplicación:${NC}"
echo ""
echo -e "${YELLOW}Terminal 1 - Backend:${NC}"
echo "  cd backend"
echo "  npm run dev"
echo ""
echo -e "${YELLOW}Terminal 2 - Frontend:${NC}"
echo "  cd frontend"
echo "  npm run dev"
echo ""
echo -e "${BLUE}Luego abre tu navegador en:${NC} http://localhost:5173"
echo ""
echo -e "${GREEN}🔑 Credenciales de prueba:${NC}"
echo "  Super Admin: admin@gestioncredifacil.com / Admin123!"
echo "  Usuario 1: usuario1@example.com / Usuario123!"
echo "  Usuario 2: usuario2@example.com / Usuario123!"
echo ""
print_message "¡Disfruta usando Gestióncredifacil!"
