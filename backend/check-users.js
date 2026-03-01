const { PrismaClient } = require('@prisma/client');

// Instancia de Prisma
const prisma = new PrismaClient();

async function checkUsers() {
    try {
        console.log("Conectando a la base de datos...");
        const users = await prisma.user.findMany({
            select: {
                id: true,
                email: true,
                fullName: true,
                role: true,
                isActive: true
            }
        });

        console.log("\nUsuarios encontrados en la Base de Datos:");
        if (users.length === 0) {
            console.log("No hay NINGÚN usuario en la base de datos de producción.");
        } else {
            console.table(users);
        }
    } catch (error) {
        console.error("Error al conectar con la base de datos:", error.message);
    } finally {
        await prisma.$disconnect();
    }
}

checkUsers();
