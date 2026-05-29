// Tipos derivados del schema Supabase. Manualmente mantenidos por ahora
// (migración futura: `supabase gen types typescript` automático).

export type Role = 'admin' | 'aprobador' | 'solicitante' | 'proveedor';
export type Phase = 'fase1' | 'hito1' | 'fase2' | 'fase3' | 'signed' | 'rejected' | 'cancelled' | 'parallel';
export type ActivePhase = 'fase2_provider_data' | 'hito1_approvals' | 'fase3_validation';
export type Semaphore = 'green' | 'yellow' | 'red' | null;
export type InternalApprovalStatus = 'pending' | 'approved' | 'rejected' | 'requested_changes' | null;

export interface WorkflowRun {
  id: string;
  created_at: string;
  updated_at?: string | null;
  current_phase: Phase;
  semaforo: Semaphore;
  internal_approval_status: InternalApprovalStatus;
  internal_approver_email?: string | null;
  internal_approved_at?: string | null;
  internal_approval_comment?: string | null;
  razon_social: string;
  tax_id: string;
  pais: string;
  tipo_proveedor?: string | null;
  nivel_acceso?: string | null;
  tipo_contrato?: string | null;
  monto?: number | null;
  moneda?: string | null;
  periodicidad?: string | null;
  tipo_duracion?: string | null;
  fecha_inicio?: string | null;
  fecha_fin?: string | null;
  solicitante_nombre?: string | null;
  solicitante_email?: string | null;
  solicitante_area?: string | null;
  owner_email?: string | null;
  owner_nombre?: string | null;
  responsable_backup_email?: string | null;
  sociedad_contratante?: string | null;
  sociedad_apoderado_email?: string | null;
  representante_legal?: string | null;
  // NOTA: email_contacto/email_facturacion/profile_* viven en la tabla
  // providers, NO en workflow_runs. No declararlos acá (eran phantom: siempre
  // undefined en runtime y producían UI silenciosamente vacía en flow-canvas).
  servicio_descripcion?: string | null;
  active_phases?: ActivePhase[] | null;
  provider_data_completed_at?: string | null;
  internal_approvals_completed_at?: string | null;
  apoderados_firmantes?: SignerEntry[] | null;
  draft_url?: string | null;
  metadata?: Record<string, unknown>;
}

export interface SignerEntry {
  apoderado_id?: string;
  name: string;
  email: string;
  role?: 'siempre' | 'secundario';
  status?: 'pending' | 'sent' | 'signed';
  signed_at?: string | null;
  notes?: string;
}

export interface Provider {
  id: string;
  created_at: string;
  updated_at?: string;
  razon_social: string;
  tax_id: string;
  pais: string;
  tipo_proveedor?: string | null;
  email_contacto?: string | null;
  email_facturacion?: string | null;
  domicilio?: string | null;
  representante_legal?: string | null;
  nivel_acceso?: string | null;
  criticidad?: string | null;
  sociedad_contratante?: string | null;
  servicio_descripcion?: string | null;
  status: 'pendiente_revision' | 'aceptado' | 'rechazado' | 'inactivo';
  public_token?: string | null;
  profile_data?: Record<string, unknown> | null;
  profile_completed_at?: string | null;
  profile_invited_at?: string | null;
}

export interface UserProfile {
  user_id: string;
  email: string;
  roles: Role[];
  sociedades: string[];
  display_name?: string | null;
  avatar_url?: string | null;
}

export interface Sociedad {
  id: string;
  slug: string;
  name: string;
  country: string;
  active: boolean;
}

export interface Apoderado {
  id: string;
  sociedad_id: string;
  name: string;
  email?: string | null;
  scope: 'siempre' | 'saas' | 'comercial' | 'general';
  tipo_proveedor_match: string[];
  priority: 1 | 2;
  notes?: string | null;
  active: boolean;
}

export interface SociedadDocument {
  id: string;
  sociedad_id: string;
  name: string;
  kind: 'base' | 'sign';
  required: boolean;
  valid_months?: number | null;
  sort_order: number;
  active: boolean;
}

export interface ContractFile {
  id: string;
  workflow_run_id: string;
  provider_id?: string | null;
  kind: 'main' | 'anexo' | 'papel_proveedor';
  storage_path: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  sha256?: string | null;
  uploaded_by: string;
  uploaded_by_id?: string | null;
  ai_review_status?: 'pending' | 'running' | 'done' | 'failed' | 'skipped' | null;
  version: number;
  previous_version_id?: string | null;
  draft_status?: 'active' | 'ai_draft' | 'superseded' | null;
  archived_at?: string | null;
  created_at: string;
}

export interface FileComment {
  id: string;
  file_id: string;
  workflow_run_id: string;
  parent_id?: string | null;
  author_email: string;
  author_id?: string | null;
  author_display_name?: string | null;
  author_avatar_url?: string | null;
  body: string;
  page_number?: number | null;
  anchor_text?: string | null;
  anchor_meta?: Record<string, unknown> | null;
  resolved: boolean;
  deleted_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PhaseCount {
  current_phase: Phase;
  total: number;
  green: number;
  yellow: number;
  red: number;
}
