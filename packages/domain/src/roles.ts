/**
 * Roles de la plataforma (RBAC, capa 1).
 *
 * Un rol responde "¿este tipo de usuario puede intentar esta acción?". **Nunca alcanza
 * por sí solo**: SEG-03 exige además permiso sobre el objeto concreto, que resuelven
 * las policies de cada módulo (docs/security-model.md §3).
 */
export const PlatformRole = {
  /** La familia empleadora. Es quien emplea, dirige y decide. */
  FAMILY_EMPLOYER: 'FAMILY_EMPLOYER',
  /** Trabajadora de casas particulares o niñera. */
  WORKER: 'WORKER',
  /** Contador matriculado. Opera con su propia clave fiscal. */
  ACCOUNTANT: 'ACCOUNTANT',
  /** Responsable de un estudio contable: ve la cartera y reasigna por capacidad. */
  ACCOUNTANT_MANAGER: 'ACCOUNTANT_MANAGER',
  /** Personal interno de operaciones. Lectura agregada, auditada. */
  OPERATIONS_AGENT: 'OPERATIONS_AGENT',
  /** Administrador de la plataforma. Acceso excepcional con motivo y expiración. */
  PLATFORM_ADMIN: 'PLATFORM_ADMIN',
  /** Soporte. Lectura acotada, sólo con ticket vinculado. */
  SUPPORT_AGENT: 'SUPPORT_AGENT',
  /** Actor no humano: jobs, sincronizaciones, vencimientos. */
  SYSTEM: 'SYSTEM',
} as const;

export type PlatformRole = (typeof PlatformRole)[keyof typeof PlatformRole];

/** Roles que exigen MFA vigente (SEG-02). */
export const MFA_REQUIRED_ROLES: readonly PlatformRole[] = [
  PlatformRole.ACCOUNTANT,
  PlatformRole.ACCOUNTANT_MANAGER,
  PlatformRole.OPERATIONS_AGENT,
  PlatformRole.PLATFORM_ADMIN,
  PlatformRole.SUPPORT_AGENT,
];

/** Roles de personal interno de la plataforma. */
export const INTERNAL_ROLES: readonly PlatformRole[] = [
  PlatformRole.OPERATIONS_AGENT,
  PlatformRole.PLATFORM_ADMIN,
  PlatformRole.SUPPORT_AGENT,
];

export function requiresMfa(role: PlatformRole): boolean {
  return MFA_REQUIRED_ROLES.includes(role);
}

export function isInternalRole(role: PlatformRole): boolean {
  return INTERNAL_ROLES.includes(role);
}
