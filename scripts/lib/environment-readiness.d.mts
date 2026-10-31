import type { Pool } from 'pg';

export type MigrationChecksum = { version: string; checksum_sha256: string };
export type CheckResult = { status: 'READY' | 'BLOCKED'; code: string; count?: number };
export function migrationChecksums(directory: string): Promise<MigrationChecksum[]>;
export function migrationsMatch(expected: MigrationChecksum[], actual: MigrationChecksum[]): boolean;
export function inspectDatabase(pool: Pool, kind: 'runtime' | 'identity'): Promise<CheckResult>;
export function inspectMigrations(pool: Pool, expected: MigrationChecksum[]): Promise<CheckResult>;
