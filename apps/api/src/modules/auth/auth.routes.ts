import { Router } from 'express';
import { authController } from './auth.controller.js';
import { validate } from '../../middleware/validate.js';
import { authLimiter, passwordResetLimiter } from '../../middleware/rate-limit.js';
import { authenticate } from '../../middleware/authenticate.js';
import {
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '@zayqora/contracts';

export const authRouter = Router();

authRouter.post('/register', authLimiter, validate(registerSchema), (req, res, next) =>
  authController.register(req, res, next)
);
authRouter.post('/login', authLimiter, authenticate, validate(loginSchema), (req, res, next) =>
  authController.login(req, res, next)
);
authRouter.post('/logout', authenticate, (req, res, next) => authController.logout(req, res, next));
authRouter.get('/me', authenticate, (req, res, next) => authController.me(req, res, next));
authRouter.post('/verify-email', authLimiter, validate(verifyEmailSchema), (req, res, next) =>
  authController.verifyEmail(req, res, next)
);
authRouter.post(
  '/resend-verification',
  authLimiter,
  validate(resendVerificationSchema),
  (req, res, next) => authController.resendVerification(req, res, next)
);
authRouter.post(
  '/password/forgot',
  passwordResetLimiter,
  validate(forgotPasswordSchema),
  (req, res, next) => authController.forgotPassword(req, res, next)
);
authRouter.post(
  '/password/reset',
  passwordResetLimiter,
  validate(resetPasswordSchema),
  (req, res, next) => authController.resetPassword(req, res, next)
);
