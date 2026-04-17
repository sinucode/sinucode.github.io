import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkUser() {
    const email = 'admin@gestioncredifacil.com';
    console.log(`Buscando usuario: ${email}...`);

    try {
        const user = await prisma.user.findUnique({
            where: { email: email.toLowerCase() },
        });

        if (user) {
            console.log('✅ Usuario encontrado:');
            console.log(`   ID: ${user.id}`);
            console.log(`   Nombre: ${user.fullName}`);
            // console.log(`   Hash: ${user.passwordHash}`); // No mostrar hash por seguridad a menos que sea necesario
            console.log(`   Rol: ${user.role}`);
            console.log(`   Activo: ${user.isActive}`);
        } else {
            console.log('❌ Usuario NO encontrado en la base de datos.');
        }
    } catch (error) {
        console.error('❌ Error al conectar con la base de datos:', error);
    } finally {
        await prisma.$disconnect();
    }
}

checkUser();
