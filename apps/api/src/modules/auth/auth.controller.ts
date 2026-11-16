import { authService } from './auth.service.js';
import { env } from '../../config/env.js';
import { setCsrfCookie } from '../../middleware/csrf.js';

export class AuthController {
  async register(
    req: import('express').Request,
    res: import('express').Response,
    next: import('express').NextFunction
  ) {
    try {
      const result = await authService.register(req.body, {
        ipAddress: req.ip,
        requestId: req.id,
      });
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }

  async login(
    req: import('express').Request,
    res: import('express').Response,
    next: import('express').NextFunction
  ) {
    try {
      const result = await authService.login(req.body, {
        ipAddress: req.ip,
        previousSessionId: req.session?.id,
        userAgent: req.headers['user-agent'],
        requestId: req.id,
      });

      // Set HttpOnly session cookie
      res.cookie(env.COOKIE_NAME, result.sessionToken, {
        httpOnly: true,
        secure: env.COOKIE_SECURE,
        sameSite: env.COOKIE_SAME_SITE,
        path: '/',
        maxAge: env.SESSION_TTL_HOURS * 3600 * 1000,
      });

      // Set CSRF cookie
      const csrfToken = setCsrfCookie(res, result.sessionToken);

      res.status(200).json({
        user: result.user,
        memberships: result.memberships,
        csrfToken,
      });
    } catch (err) {
      next(err);
    }
  }

  async logout(
    req: import('express').Request,
    res: import('express').Response,
    next: import('express').NextFunction
  ) {
    try {
      if (req.session?.id) {
        await authService.logout(req.session.id, req.user?.id, {
          ipAddress: req.ip,
          requestId: req.id,
        });
      }

      // Clear cookies
      res.clearCookie(env.COOKIE_NAME, {
        httpOnly: true,
        secure: env.COOKIE_SECURE,
        sameSite: env.COOKIE_SAME_SITE,
        path: '/',
      });

      res.clearCookie('zayqora_csrf', {
        secure: env.COOKIE_SECURE,
        sameSite: env.COOKIE_SAME_SITE,
        path: '/',
      });

      res.status(200).json({ success: true, message: 'Logged out successfully' });
    } catch (err) {
      next(err);
    }
  }

  async me(
    req: import('express').Request,
    res: import('express').Response,
    next: import('express').NextFunction
  ) {
    try {
      if (!req.user) {
        return res.status(200).json({ authenticated: false, user: null, memberships: [] });
      }

      const result = await authService.getCurrentUser(req.user!.id);
      // Ensure CSRF cookie exists
      const csrfToken = setCsrfCookie(res, req.cookies[env.COOKIE_NAME]);

      res.status(200).json({
        authenticated: true,
        user: result.user,
        memberships: result.memberships,
        csrfToken,
      });
    } catch (err) {
      next(err);
    }
  }

  async verifyEmail(
    req: import('express').Request,
    res: import('express').Response,
    next: import('express').NextFunction
  ) {
    try {
      const result = await authService.verifyEmail(req.body.token, {
        requestId: req.id,
        ipAddress: req.ip,
      });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async resendVerification(
    req: import('express').Request,
    res: import('express').Response,
    next: import('express').NextFunction
  ) {
    try {
      const result = await authService.resendVerification(req.body.email, {
        requestId: req.id,
      });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async forgotPassword(
    req: import('express').Request,
    res: import('express').Response,
    next: import('express').NextFunction
  ) {
    try {
      const result = await authService.forgotPassword(req.body.email, {
        requestId: req.id,
      });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async resetPassword(
    req: import('express').Request,
    res: import('express').Response,
    next: import('express').NextFunction
  ) {
    try {
      const result = await authService.resetPassword(req.body.token, req.body.password, {
        requestId: req.id,
        ipAddress: req.ip,
      });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
}

export const authController = new AuthController();
