import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import prisma from '../config/database';
import logger from '../utils/logger';

const router = Router();

/**
 * Temporary setup endpoint to create initial super admin user
 * Only works if NO users exist in the database (security measure)
 * Should be called once after deployment
 */
router.post('/create-admin', async (req: Request, res: Response) => {
    try {
        // Security check: only allow if no users exist
        const userCount = await prisma.user.count();

        if (userCount > 0) {
            return res.status(403).json({
                success: false,
                error: 'Setup already completed. Users already exist in database.',
            });
        }

        logger.info('Creating initial super admin user...');

        // Create super admin
        const passwordHash = await bcrypt.hash('Admin123!', 12);

        const superAdmin = await prisma.user.create({
            data: {
                email: 'admin@gestioncredifacil.com',
                passwordHash,
                fullName: 'Super Administrador',
                role: 'super_admin',
                isActive: true,
            },
        });

        logger.info(`Super admin created: ${superAdmin.email}`);

        return res.status(201).json({
            success: true,
            message: 'Initial super admin user created successfully',
            data: {
                email: superAdmin.email,
                fullName: superAdmin.fullName,
                role: superAdmin.role,
                message: 'You can now login with: admin@gestioncredifacil.com / Admin123!',
            },
        });
    } catch (error) {
        logger.error('Error creating super admin:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to create super admin user',
        });
    }
});

export default router;
