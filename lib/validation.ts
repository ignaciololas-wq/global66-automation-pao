// Helpers de validacion compartidos para server actions.
// Las acciones LANZAN ValidationError (extiende Error); el cliente captura con
// try/catch y muestra e.message. No retornan {error}.

/** Error de validacion. Mismo contrato que Error; name fijo para identificarlo. */
export class ValidationError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'ValidationError';
  }
}

/** Afirma una condicion; lanza ValidationError(msg) si es falsy. */
export function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    throw new ValidationError(msg);
  }
}

/** Campo obligatorio: convierte a string + trim; lanza si vacio o si supera maxLen. */
export function requireField(v: unknown, name: string, maxLen?: number): string {
  const s = String(v ?? '').trim();
  if (s === '') {
    throw new ValidationError(`${name} es requerido`);
  }
  if (maxLen !== undefined && s.length > maxLen) {
    throw new ValidationError(`${name} supera ${maxLen} caracteres`);
  }
  return s;
}

/** Campo opcional: undefined si null/undefined/vacio; si no, trim + clamp a maxLen. */
export function optionalString(v: unknown, maxLen?: number): string | undefined {
  if (v === null || v === undefined) {
    return undefined;
  }
  const s = String(v).trim();
  if (s === '') {
    return undefined;
  }
  return maxLen !== undefined ? clampLen(s, maxLen) : s;
}

/** Valida formato de email con regex simple y razonable. */
export function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

/** Email obligatorio: requireField + isEmail; lanza si el formato es invalido. */
export function requireEmail(v: unknown, name: string): string {
  const s = requireField(v, name);
  if (!isEmail(s)) {
    throw new ValidationError(`${name} no es un email valido`);
  }
  return s;
}

/** Email opcional: undefined si vacio; si tiene valor, valida formato. */
export function optionalEmail(v: unknown, name: string): string | undefined {
  const s = optionalString(v);
  if (s === undefined) {
    return undefined;
  }
  if (!isEmail(s)) {
    throw new ValidationError(`${name} no es un email valido`);
  }
  return s;
}

/** Numero obligatorio >= 0: Number(v); lanza si NaN o negativo. */
export function requirePositiveNumber(v: unknown, name: string): number {
  const n = Number(v);
  if (Number.isNaN(n) || n < 0) {
    throw new ValidationError(`${name} debe ser un numero >= 0`);
  }
  return n;
}

/** Recorta el string a un maximo de caracteres. */
export function clampLen(s: string, max: number): string {
  return s.slice(0, max);
}
