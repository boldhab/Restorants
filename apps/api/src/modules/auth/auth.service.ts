import type { RegisterInput } from '@zayqora/contracts';
interface ServiceContext {
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
  idempotencyKey?: string;
  userId?: string;
  previousSessionId?: string;
}
import { authRepository } from './auth.repository.js';
import { withTransaction } from '../../database/transaction.js';
import { hashPassword, verifyPassword } from '../../shared/security/passwords.js';
import { generateOpaqueToken, hashToken } from '../../shared/security/tokens.js';
import { emailService } from '../../integrations/email/email-service.js';
import { env } from '../../config/env.js';
import {
  ConflictError,
  UnauthorizedError,
  ValidationError,
} from '../../shared/errors/app-error.js';
import { logger } from '../../config/logger.js';

export class AuthService {
  async register(
    { email, password, full_name, phone }: RegisterInput,
    context: ServiceContext = {}
  ) {
    const existingUser = await authRepository.findUserByEmail(email);
    if (existingUser) {
      throw new ConflictError('An account with this email address already exists');
    }

    const passwordHash = await hashPassword(password);
    const verificationRawToken = generateOpaqueToken(32);
    const tokenHash = hashToken(verificationRawToken);
    const expiresAt = new Date(Date.now() + 24 * 3600 * 1000); // 24 hours

    const user = await withTransaction(async (client) => {
      const newUser = await authRepository.createUser(
        { email, passwordHash, fullName: full_name, phone },
        client
      );

      await authRepository.createVerificationToken(
        { userId: newUser.id, tokenHash, expiresAt },
        client
      );

      await authRepository.createAuditLog(
        {
          actorId: newUser.id,
          action: 'user.registered',
          targetType: 'user',
          targetId: newUser.id,
          metadata: { email: newUser.email },
          requestId: context.requestId,
          ipAddress: context.ipAddress,
        },
        client
      );

      return newUser;
    });

    // Send verification email asynchronously
    try {
      await emailService.sendVerificationEmail(user.email, verificationRawToken, user.full_name);
    } catch (emailErr) {
      logger.error({ err: emailErr }, 'Failed to send verification email');
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        phone: user.phone,
        is_email_verified: user.is_email_verified,
        is_platform_admin: user.is_platform_admin,
        created_at: user.created_at,
      },
      message: 'Registration successful. Please check your email to verify your account.',
    };
  }

  async login(
    { email, password }: { email: string; password: string },
    context: ServiceContext = {}
  ) {
    const user = await authRepository.findUserByEmail(email);
    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
      throw new UnauthorizedError('Invalid email or password');
    }

    // Session rotation: generate new session token
    const sessionRawToken = generateOpaqueToken(32);
    const tokenHash = hashToken(sessionRawToken);
    const expiresAt = new Date(Date.now() + env.SESSION_TTL_HOURS * 3600 * 1000);

    const session = await withTransaction(async (client) => {
      if (context.previousSessionId)
        await authRepository.revokeSession(context.previousSessionId, client);
      const newSession = await authRepository.createSession(
        {
          userId: user.id,
          tokenHash,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          expiresAt,
        },
        client
      );

      await authRepository.createAuditLog(
        {
          actorId: user.id,
          action: 'user.login',
          targetType: 'user',
          targetId: user.id,
          metadata: { sessionId: newSession.id },
          requestId: context.requestId,
          ipAddress: context.ipAddress,
        },
        client
      );

      return newSession;
    });

    // Fetch user memberships
    const memberships = await authRepository.getUserMemberships(user.id);

    return {
      sessionToken: sessionRawToken,
      expiresAt: session.expires_at,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        phone: user.phone,
        is_email_verified: user.is_email_verified,
        is_platform_admin: user.is_platform_admin,
      },
      memberships,
    };
  }

  async logout(sessionId: string, userId: string | undefined, context: ServiceContext = {}) {
    if (!sessionId) return;

    await withTransaction(async (client) => {
      await authRepository.revokeSession(sessionId, client);
      if (userId) {
        await authRepository.createAuditLog(
          {
            actorId: userId,
            action: 'user.logout',
            targetType: 'session',
            targetId: sessionId,
            requestId: context.requestId,
            ipAddress: context.ipAddress,
          },
          client
        );
      }
    });
  }

  async getCurrentUser(userId: string) {
    const user = await authRepository.findUserById(userId);
    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    const memberships = await authRepository.getUserMemberships(userId);

    return {
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        phone: user.phone,
        is_email_verified: user.is_email_verified,
        is_platform_admin: user.is_platform_admin,
      },
      memberships,
    };
  }

  async verifyEmail(rawToken: string, context: ServiceContext = {}) {
    const tokenHash = hashToken(rawToken);

    await withTransaction(async (client) => {
      const consumed = await authRepository.consumeVerificationToken(tokenHash, client);
      if (!consumed) {
        throw new ValidationError('Invalid or expired verification token');
      }

      await authRepository.updateUserVerification(consumed.user_id, true, client);

      await authRepository.createAuditLog(
        {
          actorId: consumed.user_id,
          action: 'user.email_verified',
          targetType: 'user',
          targetId: consumed.user_id,
          requestId: context.requestId,
          ipAddress: context.ipAddress,
        },
        client
      );

      return consumed;
    });

    return { success: true, message: 'Email verified successfully.' };
  }

  async resendVerification(email: string, _context: ServiceContext = {}) {
    const user = await authRepository.findUserByEmail(email);
    // Generic response to avoid email enumeration
    if (!user || user.is_email_verified) {
      return {
        success: true,
        message: 'If an unverified account exists, a new verification link has been sent.',
      };
    }

    const verificationRawToken = generateOpaqueToken(32);
    const tokenHash = hashToken(verificationRawToken);
    const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);

    await authRepository.createVerificationToken({
      userId: user.id,
      tokenHash,
      expiresAt,
    });

    try {
      await emailService.sendVerificationEmail(user.email, verificationRawToken, user.full_name);
    } catch (err) {
      logger.error({ err }, 'Failed to resend verification email');
    }

    return {
      success: true,
      message: 'If an unverified account exists, a new verification link has been sent.',
    };
  }

  async forgotPassword(email: string, _context: ServiceContext = {}) {
    const user = await authRepository.findUserByEmail(email);
    // Generic response to prevent account enumeration
    if (!user) {
      return {
        success: true,
        message: 'If an account exists, a password reset link has been sent.',
      };
    }

    const resetRawToken = generateOpaqueToken(32);
    const tokenHash = hashToken(resetRawToken);
    const expiresAt = new Date(Date.now() + 3600 * 1000); // 1 hour

    await authRepository.createPasswordResetToken({
      userId: user.id,
      tokenHash,
      expiresAt,
    });

    try {
      await emailService.sendPasswordResetEmail(user.email, resetRawToken, user.full_name);
    } catch (err) {
      logger.error({ err }, 'Failed to send password reset email');
    }

    return { success: true, message: 'If an account exists, a password reset link has been sent.' };
  }

  async resetPassword(rawToken: string, newPassword: string, context: ServiceContext = {}) {
    const tokenHash = hashToken(rawToken);
    const newPasswordHash = await hashPassword(newPassword);

    await withTransaction(async (client) => {
      const consumed = await authRepository.consumePasswordResetToken(tokenHash, client);
      if (!consumed) {
        throw new ValidationError('Invalid or expired password reset token');
      }

      // Update password
      await authRepository.updateUserPassword(consumed.user_id, newPasswordHash, client);

      // Revoke ALL existing active sessions for security!
      await authRepository.revokeAllUserSessions(consumed.user_id, client);

      await authRepository.createAuditLog(
        {
          actorId: consumed.user_id,
          action: 'user.password_reset',
          targetType: 'user',
          targetId: consumed.user_id,
          requestId: context.requestId,
          ipAddress: context.ipAddress,
        },
        client
      );
    });

    return {
      success: true,
      message: 'Password has been reset successfully. Please log in with your new password.',
    };
  }
}

export const authService = new AuthService();
