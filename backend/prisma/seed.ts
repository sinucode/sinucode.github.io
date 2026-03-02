import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Iniciando seed de base de datos...');

    // Limpiar datos existentes (opcional - comentar en producción)
    console.log('🗑️  Limpiando datos existentes...');
    await prisma.auditLog.deleteMany();
    await prisma.emailReminder.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.paymentSchedule.deleteMany();
    await prisma.cashMovement.deleteMany();
    await prisma.credit.deleteMany();
    await prisma.client.deleteMany();
    await prisma.userBusiness.deleteMany();
    await prisma.business.deleteMany();
    await prisma.user.deleteMany();

    // 1. Crear usuarios
    console.log('👤 Creando usuarios...');

    const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'Admin123!';
    const userPassword = process.env.SEED_USER_PASSWORD || 'Usuario123!';
    const adminEmail = process.env.INITIAL_ADMIN_EMAIL || 'admin@gestioncredifacil.com';

    const passwordHash = await bcrypt.hash(adminPassword, 12);
    const userPasswordHash = await bcrypt.hash(userPassword, 12);

    const superAdmin = await prisma.user.create({
        data: {
            email: adminEmail,
            passwordHash,
            fullName: 'Super Administrador',
            role: 'super_admin',
            isActive: true,
        },
    });

    const adminUser = await prisma.user.create({
        data: {
            email: 'admin1@example.com',
            passwordHash,
            fullName: 'María González',
            role: 'admin',
            isActive: true,
        },
    });

    const regularUser = await prisma.user.create({
        data: {
            email: 'usuario1@example.com',
            passwordHash: userPasswordHash,
            fullName: 'Juan Pérez',
            role: 'user',
            isActive: true,
        },
    });

    console.log(`✅ Super Admin creado: ${superAdmin.email}`);
    console.log(`✅ Admin creado: ${adminUser.email}`);
    console.log(`✅ Usuario creado: ${regularUser.email}`);

    // 2. Crear negocios
    console.log('🏢 Creando negocios...');

    const business1 = await prisma.business.create({
        data: {
            name: 'Créditos Express',
            description: 'Negocio de créditos rápidos',
            initialCapital: 5000000, // 5 millones
            currentBalance: 5000000,
            createdById: superAdmin.id,
        },
    });

    const business2 = await prisma.business.create({
        data: {
            name: 'Préstamos Fácil',
            description: 'Soluciones de financiamiento',
            initialCapital: 3000000, // 3 millones
            currentBalance: 3000000,
            createdById: superAdmin.id,
        },
    });

    console.log(`✅ Negocio creado: ${business1.name}`);
    console.log(`✅ Negocio creado: ${business2.name}`);

    // 3. Asignar usuarios a negocios
    console.log('🔗 Asignando usuarios a negocios...');

    await prisma.userBusiness.create({
        data: {
            userId: adminUser.id,
            businessId: business1.id,
        },
    });

    await prisma.userBusiness.create({
        data: {
            userId: regularUser.id,
            businessId: business2.id,
        },
    });

    console.log(`✅ Usuario ${adminUser.fullName} asignado a ${business1.name}`);
    console.log(`✅ Usuario ${regularUser.fullName} asignado a ${business2.name}`);

    // 4. Crear clientes de ejemplo
    console.log('👥 Creando clientes de ejemplo...');

    const client1 = await prisma.client.create({
        data: {
            businessId: business1.id,
            phone: '3001234567',
            cedula: '1234567890',
            fullName: 'Carlos Rodríguez',
            address: 'Calle 123 #45-67, Bogotá',
        },
    });

    const client2 = await prisma.client.create({
        data: {
            businessId: business1.id,
            phone: '3009876543',
            cedula: '9876543210',
            fullName: 'Ana Martínez',
            address: 'Carrera 45 #12-34, Medellín',
        },
    });

    const client3 = await prisma.client.create({
        data: {
            businessId: business2.id,
            phone: '3005551234',
            cedula: '5551234567',
            fullName: 'Luis Hernández',
            address: 'Avenida 68 #23-45, Cali',
        },
    });

    console.log(`✅ ${client1.fullName} creado`);
    console.log(`✅ ${client2.fullName} creado`);
    console.log(`✅ ${client3.fullName} creado`);

    // 5. Registrar movimientos de caja inicial
    console.log('💰 Registrando capital inicial en caja...');

    await prisma.cashMovement.create({
        data: {
            businessId: business1.id,
            type: 'initial_capital',
            amount: 5000000,
            balanceAfter: 5000000,
            description: 'Capital inicial del negocio',
            createdById: superAdmin.id,
        },
    });

    await prisma.cashMovement.create({
        data: {
            businessId: business2.id,
            type: 'initial_capital',
            amount: 3000000,
            balanceAfter: 3000000,
            description: 'Capital inicial del negocio',
            createdById: superAdmin.id,
        },
    });

    console.log('✅ Movimientos de caja inicial registrados');

    // 6. Crear un crédito de ejemplo
    console.log('💳 Creando crédito de ejemplo...');

    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(startDate.getDate() + 30); // 30 días

    const creditAmount = 1000000;
    const interestRate = 10;
    const totalInterest = (creditAmount * interestRate) / 100;
    const totalWithInterest = creditAmount + totalInterest;

    const credit1 = await prisma.credit.create({
        data: {
            businessId: business1.id,
            clientId: client1.id,
            amount: creditAmount,
            interestRate,
            totalWithInterest,
            paymentFrequency: 'weekly',
            startDate,
            endDate,
            termDays: 30,
            remainingBalance: totalWithInterest,
            status: 'active',
            createdById: adminUser.id,
        },
    });

    console.log(`✅ Crédito creado: $${creditAmount.toLocaleString('es-CO')} a ${client1.fullName}`);

    // 7. Crear plan de pagos para el crédito
    console.log('📅 Creando plan de pagos...');

    const numberOfPayments = 4; // 4 semanas
    const paymentAmount = totalWithInterest / numberOfPayments;

    for (let i = 0; i < numberOfPayments; i++) {
        const dueDate = new Date(startDate);
        dueDate.setDate(startDate.getDate() + (i + 1) * 7); // Cada 7 días

        await prisma.paymentSchedule.create({
            data: {
                creditId: credit1.id,
                installmentNumber: i + 1,
                dueDate,
                scheduledAmount: paymentAmount,
                paidAmount: 0,
                status: 'pending',
            },
        });
    }

    console.log(`✅ Plan de pagos creado: ${numberOfPayments} cuotas de $${paymentAmount.toLocaleString('es-CO')}`);

    // 8. Registrar desembolso del crédito en caja
    const newBalance = 5000000 - creditAmount;
    await prisma.cashMovement.create({
        data: {
            businessId: business1.id,
            type: 'loan_disbursement',
            amount: creditAmount,
            balanceAfter: newBalance,
            description: `Desembolso de crédito a ${client1.fullName}`,
            relatedCreditId: credit1.id,
            createdById: adminUser.id,
        },
    });

    await prisma.business.update({
        where: { id: business1.id },
        data: { currentBalance: newBalance },
    });

    console.log('✅ Desembolso registrado en caja');

    console.log('\n🎉 ¡Seed completado exitosamente!');
    console.log('\n📊 Resumen:');
    console.log(`   - Usuarios: 3 (1 super admin, 1 admin, 1 usuario)`);
    console.log(`   - Negocios: 2`);
    console.log(`   - Clientes: 3`);
    console.log(`   - Créditos: 1 activo`);
    console.log('\n🔑 Credenciales de acceso:');
    console.log(`   Super Admin: ${superAdmin.email} / (Contraseña configurada)`);
    console.log(`   Admin: admin1@example.com / (Contraseña de admin configurada)`);
    console.log(`   Usuario: usuario1@example.com / (Contraseña de usuario configurada)`);
}

main()
    .catch((e) => {
        console.error('❌ Error durante el seed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
