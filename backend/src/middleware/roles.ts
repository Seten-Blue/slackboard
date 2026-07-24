import { Response, NextFunction } from 'express';
import User from '../models/User';
import { AuthRequest } from './auth';

const ROLE_HIERARCHY: Record<string, number> = {
  guest: 0,
  member: 1,
  manager: 2,
  admin: 3,
  owner: 4,
};

export function requireRole(...allowedRoles: string[]) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.userId) {
        return res.status(401).json({ success: false, message: 'No autenticado' });
      }

      const user = await User.findById(req.userId).select('role').lean();
      if (!user) {
        return res.status(401).json({ success: false, message: 'Usuario no encontrado' });
      }

      if (!allowedRoles.includes(user.role)) {
        return res.status(403).json({
          success: false,
          message: `Se requiere uno de estos roles: ${allowedRoles.join(', ')}`,
        });
      }

      next();
    } catch (error: any) {
      res.status(500).json({ success: false, message: 'Error verificando permisos', error: error.message });
    }
  };
}

export function requireMinRole(minRole: string) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.userId) {
        return res.status(401).json({ success: false, message: 'No autenticado' });
      }

      const user = await User.findById(req.userId).select('role').lean();
      if (!user) {
        return res.status(401).json({ success: false, message: 'Usuario no encontrado' });
      }

      const userLevel = ROLE_HIERARCHY[user.role] ?? 0;
      const requiredLevel = ROLE_HIERARCHY[minRole] ?? 0;

      if (userLevel < requiredLevel) {
        return res.status(403).json({
          success: false,
          message: `Se requiere al menos el rol "${minRole}"`,
        });
      }

      next();
    } catch (error: any) {
      res.status(500).json({ success: false, message: 'Error verificando permisos', error: error.message });
    }
  };
}
