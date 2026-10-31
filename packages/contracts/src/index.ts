import { z } from 'zod';

export const roleSchema = z.enum(['owner', 'admin', 'editor', 'reviewer', 'analyst']);
export type Role = z.infer<typeof roleSchema>;
export const organizationIdSchema = z.uuid();
export const permissions = {
  'organization:read': ['owner', 'admin', 'editor', 'reviewer', 'analyst'],
  'organization:manage': ['owner', 'admin'],
  'project:write': ['owner', 'admin', 'editor'],
  'editorial:review': ['owner', 'reviewer'],
} as const satisfies Record<string, readonly Role[]>;
export type Permission = keyof typeof permissions;
export const can = (role: string, permission: Permission): boolean =>
  (permissions[permission] as readonly string[]).includes(role);

export const errorCodes = ['UNAUTHENTICATED', 'FORBIDDEN', 'MFA_REQUIRED', 'INVALID_INPUT',
  'BLOCKED_EXTERNAL', 'SERVICE_UNAVAILABLE', 'NOT_IMPLEMENTED', 'INTERNAL_ERROR'] as const;
export type ErrorCode = typeof errorCodes[number];
export class AppError extends Error {
  constructor(public code: ErrorCode, public status: number) { super(code); }
}

export type VerifiedIdentity = {
  subject: string;
  expiresAt: Date;
  twoFactorEnabled: boolean;
};
export type OrganizationContext = {
  organizationId: string;
  actorId: string;
  role: Role;
};
