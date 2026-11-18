import nodemailer from 'nodemailer';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

class EmailService {
  sentEmails: Array<{
    to: string;
    from: string;
    subject: string;
    text: string;
    html: string;
    sentAt: string;
  }>;
  constructor() {
    this.sentEmails = [];
  }

  async sendEmail({
    to,
    subject,
    text,
    html,
  }: {
    to: string;
    subject: string;
    text: string;
    html: string;
  }) {
    const emailRecord = {
      to,
      from: env.EMAIL_FROM,
      subject,
      text,
      html,
      sentAt: new Date().toISOString(),
    };

    if (env.EMAIL_PROVIDER === 'memory' || env.IS_TEST) {
      this.sentEmails.push(emailRecord);
      logger.info({ to, subject }, 'Email sent via in-memory email service');
      return { success: true, messageId: `mem-${Date.now()}` };
    }

    const transport = nodemailer.createTransport({
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 30000,
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
    return transport.sendMail({ from: env.EMAIL_FROM, to, subject, text });
  }

  async sendVerificationEmail(to: string, token: string, fullName: string) {
    const verifyUrl = `${env.APP_URL}/verify-email?token=${token}`;
    const subject = 'Verify your ZAYQORA account';
    const text = `Hello ${fullName},\n\nPlease verify your email address by visiting: ${verifyUrl}\n\nThis link will expire in 24 hours.`;
    const html = `<p>Hello ${fullName},</p><p>Please verify your email address by clicking <a href="${verifyUrl}">here</a>.</p><p>This link will expire in 24 hours.</p>`;

    return this.sendEmail({ to, subject, text, html });
  }

  async sendPasswordResetEmail(to: string, token: string, fullName: string) {
    const resetUrl = `${env.APP_URL}/reset-password?token=${token}`;
    const subject = 'Reset your ZAYQORA password';
    const text = `Hello ${fullName},\n\nYou requested a password reset. You can reset your password by visiting: ${resetUrl}\n\nThis link will expire in 1 hour. If you did not request this, please ignore this email.`;
    const html = `<p>Hello ${fullName},</p><p>You requested a password reset. You can reset your password by clicking <a href="${resetUrl}">here</a>.</p><p>This link will expire in 1 hour.</p>`;

    return this.sendEmail({ to, subject, text, html });
  }

  getSentEmails() {
    return [...this.sentEmails];
  }

  getLastEmailFor(email: string) {
    const lower = email.toLowerCase();
    for (let i = this.sentEmails.length - 1; i >= 0; i--) {
      if (this.sentEmails[i].to.toLowerCase() === lower) {
        return this.sentEmails[i];
      }
    }
    return null;
  }

  clearSentEmails() {
    this.sentEmails = [];
  }
}

export const emailService = new EmailService();
