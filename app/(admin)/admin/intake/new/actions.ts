'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { requireField, requireEmail, requirePositiveNumber, clampLen } from '@/lib/validation';

export interface IntakeInput {
  solicitante_nombre: string;
  solicitante_email: string;
  solicitante_area: string;
  owner_es_solicitante: boolean;
  owner_nombre?: string;
  owner_email: string;
  responsable_backup_email: string;
  razon_social: string;
  rut: string;
  pais: string;
  sociedad_contratante?: string;
  representante_legal: string;
  email_contacto: string;
  email_facturacion: string;
  proveedor_existente: boolean;
  tipo_proveedor: string;
  servicio_descripcion: string;
  periodicidad: string;
  monto: number;
  moneda: string;
  tipo_duracion: string;
  fecha_inicio?: string;
  fecha_fin?: string;
  notas?: string;
}

export async function createIntake(input: IntakeInput) {
  const auth = await getCurrentUser();
  if (!auth.ok) throw new Error('No autorizado');

  // --- Validación de entrada (antes de tocar la DB) ---
  // Las server actions LANZAN errores; el formulario cliente los captura y muestra e.message.
  requireField(input.solicitante_nombre, 'Nombre del solicitante', 200);
  requireEmail(input.solicitante_email, 'Email del solicitante');
  requireField(input.solicitante_area, 'Área del solicitante', 200);
  requireEmail(input.owner_email, 'Email del owner');
  requireEmail(input.responsable_backup_email, 'Email del responsable backup');
  requireField(input.razon_social, 'Razón social', 200);
  requireField(input.rut, 'RUT', 200);
  requireField(input.pais, 'País', 200);
  requireField(input.representante_legal, 'Representante legal', 200);
  requireEmail(input.email_contacto, 'Email de contacto');
  requireEmail(input.email_facturacion, 'Email de facturación');
  requireField(input.tipo_proveedor, 'Tipo de proveedor', 200);
  requireField(input.sociedad_contratante, 'Sociedad contratante', 200);
  requireField(input.servicio_descripcion, 'Descripción del servicio', 2000);
  requireField(input.periodicidad, 'Periodicidad', 200);
  requireField(input.moneda, 'Moneda', 200);
  requireField(input.tipo_duracion, 'Tipo de duración', 200);
  requirePositiveNumber(input.monto, 'Monto');

  // Reglas de negocio: fechas según tipo de duración.
  if (input.tipo_duracion) {
    requireField(input.fecha_inicio, 'Fecha de inicio', 200);
    if (input.tipo_duracion === 'plazo_fijo') {
      requireField(input.fecha_fin, 'Fecha de fin', 200);
    }
  }

  // Clamp de longitud en campos de texto que se persisten (defensa adicional).
  input.servicio_descripcion = clampLen(input.servicio_descripcion, 2000);
  if (input.owner_nombre) input.owner_nombre = clampLen(input.owner_nombre, 200);
  if (input.notas) input.notas = clampLen(input.notas, 2000);
  // --- Fin validación ---

  const sb = createAdminClient();

  const { data: existing } = await sb
    .from('providers')
    .select('*')
    .eq('tax_id', input.rut)
    .maybeSingle();

  let providerId: string;
  let providerNew = false;
  if (existing) {
    providerId = (existing as any).id;
    const patch: Record<string, any> = {};
    const fields = ['razon_social', 'tipo_proveedor', 'email_contacto', 'email_facturacion', 'representante_legal', 'sociedad_contratante', 'servicio_descripcion', 'pais'] as const;
    for (const f of fields) {
      if ((input as any)[f] && (input as any)[f] !== (existing as any)[f]) patch[f] = (input as any)[f];
    }
    if (Object.keys(patch).length) await sb.from('providers').update(patch).eq('id', providerId);
  } else {
    const token = randomToken();
    const { data, error } = await sb
      .from('providers')
      .insert({
        razon_social: input.razon_social,
        tax_id: input.rut,
        pais: input.pais,
        tipo_proveedor: input.tipo_proveedor,
        email_contacto: input.email_contacto,
        email_facturacion: input.email_facturacion,
        representante_legal: input.representante_legal,
        sociedad_contratante: input.sociedad_contratante,
        servicio_descripcion: input.servicio_descripcion,
        public_token: token,
        status: 'pendiente_revision',
      })
      .select('id')
      .single();
    if (error) throw new Error('Provider create: ' + error.message);
    providerId = (data as any).id;
    providerNew = true;
  }

  const insert: Record<string, any> = {
    form_response_id: `intake-${Date.now()}`,
    owner_email: input.owner_email,
    razon_social: input.razon_social,
    tax_id: input.rut,
    pais: input.pais,
    tipo_proveedor: input.tipo_proveedor,
    monto: input.monto,
    moneda: input.moneda,
    solicitante_nombre: input.solicitante_nombre,
    solicitante_email: input.solicitante_email,
    solicitante_area: input.solicitante_area,
    owner_es_solicitante: input.owner_es_solicitante,
    owner_nombre: input.owner_nombre,
    responsable_backup_email: input.responsable_backup_email,
    sociedad_contratante: input.sociedad_contratante,
    representante_legal: input.representante_legal,
    // email_contacto y email_facturacion solo viven en tabla providers (no workflow_runs)
    servicio_descripcion: input.servicio_descripcion,
    proveedor_existente: input.proveedor_existente,
    periodicidad: input.periodicidad,
    tipo_duracion: input.tipo_duracion,
    fecha_inicio: input.fecha_inicio || null,
    fecha_fin: input.fecha_fin || null,
    internal_approval_status: 'pending',
    current_phase: 'fase1',
  };
  for (const k of Object.keys(insert)) if (insert[k] == null || insert[k] === '') delete insert[k];

  const { data, error } = await sb.from('workflow_runs').insert(insert).select('id').single();
  if (error) throw new Error('Workflow create: ' + error.message);

  revalidatePath('/admin');
  revalidatePath('/admin/workflows');

  return { run_id: (data as any).id, provider_id: providerId, provider_new: providerNew };
}

function randomToken() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-';
  let s = '';
  for (let i = 0; i < 32; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export async function lookupProviderByTaxId(taxId: string) {
  const sb = createAdminClient();
  const { data } = await sb
    .from('providers')
    .select('id, razon_social, tax_id, pais, tipo_proveedor, email_contacto, email_facturacion, representante_legal, sociedad_contratante, servicio_descripcion, profile_data, profile_completed_at')
    .eq('tax_id', taxId)
    .maybeSingle();
  return data ?? null;
}
