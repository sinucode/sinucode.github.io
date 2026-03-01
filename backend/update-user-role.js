/**
 * Script para actualizar el rol de un usuario a super_admin
 * Uso: node update-user-role.js
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function updateUserRole() {
    try {
        console.log('Actualizando rol del usuario admin@wsm.com a super_admin...');

        const result = await prisma.user.update({
            where: {
                email: 'admin@wsm.com'
            },
            data: {
                role: 'super_admin'
            },
            select: {
                id: true,
                email: true,
                fullName: true,
                role: true
            }
        });

        console.log('✅ Usuario actualizado exitosamente:');
        console.log(JSON.stringify(result, null, 2));

    } catch (error) {
        console.error('❌ Error actualizando usuario:', error.message);

        if (error.code === 'P2025') {
            console.error('El usuario admin@wsm.com no existe en la base de datos');
        }
    } finally {
        await prisma.$disconnect();
    }
}

updateUserRole();
