const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function enableRLS() {
    const tables = [
        "users",
        "businesses",
        "clients",
        "credits",
        "payment_schedule",
        "payments",
        "cash_movements",
        "audit_log",
        "email_reminders",
        "user_business",
        "_prisma_migrations"
    ];

    console.log('Iniciando activación de RLS (Row Level Security)...');
    
    for (const table of tables) {
        try {
            await prisma.$executeRawUnsafe(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY;`);
            console.log(`✅ RLS activado exitosamente para la tabla: ${table}`);
        } catch (error) {
            console.error(`❌ Error activando RLS en ${table}:`, error.message || error);
        }
    }
    console.log('Proceso finalizado.');
}

enableRLS()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
