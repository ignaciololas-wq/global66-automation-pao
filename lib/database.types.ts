// AUTO-GENERADO por Supabase (mcp generate_typescript_types) 2026-05-29.
// NO editar a mano. Regenerar tras cambios de schema.
// Reference de tipos del schema public para tipar el cliente Supabase.
/* eslint-disable @typescript-eslint/no-explicit-any */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ai_edit_jobs: {
        Row: {
          comments_snapshot: Json
          created_at: string
          diff_summary: string | null
          draft_file_id: string | null
          error_message: string | null
          finished_at: string | null
          id: string
          llm_cost_usd: number | null
          prompt: string | null
          requested_by: string
          requested_by_id: string | null
          source_file_id: string
          status: string
          workflow_run_id: string
        }
        Insert: {
          comments_snapshot?: Json
          created_at?: string
          diff_summary?: string | null
          draft_file_id?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          llm_cost_usd?: number | null
          prompt?: string | null
          requested_by: string
          requested_by_id?: string | null
          source_file_id: string
          status?: string
          workflow_run_id: string
        }
        Update: {
          comments_snapshot?: Json
          created_at?: string
          diff_summary?: string | null
          draft_file_id?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          llm_cost_usd?: number | null
          prompt?: string | null
          requested_by?: string
          requested_by_id?: string | null
          source_file_id?: string
          status?: string
          workflow_run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_edit_jobs_draft_file_id_fkey"
            columns: ["draft_file_id"]
            isOneToOne: false
            referencedRelation: "contract_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_edit_jobs_source_file_id_fkey"
            columns: ["source_file_id"]
            isOneToOne: false
            referencedRelation: "contract_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_edit_jobs_workflow_run_id_fkey"
            columns: ["workflow_run_id"]
            isOneToOne: false
            referencedRelation: "v_workflow_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_edit_jobs_workflow_run_id_fkey"
            columns: ["workflow_run_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      apoderados: {
        Row: {
          active: boolean
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          priority: number
          scope: string
          sociedad_id: string
          tipo_proveedor_match: string[]
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          priority?: number
          scope?: string
          sociedad_id: string
          tipo_proveedor_match?: string[]
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          priority?: number
          scope?: string
          sociedad_id?: string
          tipo_proveedor_match?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "apoderados_sociedad_id_fkey"
            columns: ["sociedad_id"]
            isOneToOne: false
            referencedRelation: "sociedades"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      approvals: {
        Row: {
          approver_email: string | null
          approver_slack_id: string | null
          comment: string | null
          created_at: string
          decided_at: string
          decision: string
          id: string
          team: string
          workflow_run_id: string
        }
        Insert: {
          approver_email?: string | null
          approver_slack_id?: string | null
          comment?: string | null
          created_at?: string
          decided_at?: string
          decision: string
          id?: string
          team: string
          workflow_run_id: string
        }
        Update: {
          approver_email?: string | null
          approver_slack_id?: string | null
          comment?: string | null
          created_at?: string
          decided_at?: string
          decision?: string
          id?: string
          team?: string
          workflow_run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "approvals_workflow_run_id_fkey"
            columns: ["workflow_run_id"]
            isOneToOne: false
            referencedRelation: "v_workflow_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_workflow_run_id_fkey"
            columns: ["workflow_run_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor: string
          created_at: string
          id: number
          payload: Json | null
          target_id: string | null
          target_type: string | null
          workflow_run_id: string | null
        }
        Insert: {
          action: string
          actor: string
          created_at?: string
          id?: number
          payload?: Json | null
          target_id?: string | null
          target_type?: string | null
          workflow_run_id?: string | null
        }
        Update: {
          action?: string
          actor?: string
          created_at?: string
          id?: number
          payload?: Json | null
          target_id?: string | null
          target_type?: string | null
          workflow_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_workflow_run_id_fkey"
            columns: ["workflow_run_id"]
            isOneToOne: false
            referencedRelation: "v_workflow_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_workflow_run_id_fkey"
            columns: ["workflow_run_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_files: {
        Row: {
          ai_review_status: string | null
          archived_at: string | null
          created_at: string
          draft_status: string | null
          filename: string
          id: string
          kind: string
          metadata: Json | null
          mime_type: string
          previous_version_id: string | null
          provider_id: string | null
          sha256: string | null
          size_bytes: number
          storage_path: string
          uploaded_by: string
          uploaded_by_id: string | null
          version: number
          workflow_run_id: string
        }
        Insert: {
          ai_review_status?: string | null
          archived_at?: string | null
          created_at?: string
          draft_status?: string | null
          filename: string
          id?: string
          kind: string
          metadata?: Json | null
          mime_type: string
          previous_version_id?: string | null
          provider_id?: string | null
          sha256?: string | null
          size_bytes: number
          storage_path: string
          uploaded_by: string
          uploaded_by_id?: string | null
          version?: number
          workflow_run_id: string
        }
        Update: {
          ai_review_status?: string | null
          archived_at?: string | null
          created_at?: string
          draft_status?: string | null
          filename?: string
          id?: string
          kind?: string
          metadata?: Json | null
          mime_type?: string
          previous_version_id?: string | null
          provider_id?: string | null
          sha256?: string | null
          size_bytes?: number
          storage_path?: string
          uploaded_by?: string
          uploaded_by_id?: string | null
          version?: number
          workflow_run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_files_previous_version_id_fkey"
            columns: ["previous_version_id"]
            isOneToOne: false
            referencedRelation: "contract_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_files_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_files_workflow_run_id_fkey"
            columns: ["workflow_run_id"]
            isOneToOne: false
            referencedRelation: "v_workflow_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_files_workflow_run_id_fkey"
            columns: ["workflow_run_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          cancelled_at: string | null
          created_at: string
          draft_pdf_url: string | null
          end_date: string | null
          id: string
          is_adhesion: boolean | null
          metadata: Json | null
          moneda: string | null
          monto: number | null
          owner_email: string | null
          periodicidad: string | null
          preaviso_dias: number | null
          provider_id: string
          renovacion_automatica: boolean | null
          signed_at: string | null
          signed_pdf_url: string | null
          signnow_document_id: string | null
          sociedad_contratante: string | null
          start_date: string | null
          status: string
          tipo_contrato: string | null
          tipo_duracion: string | null
          updated_at: string
          vigencia_meses: number | null
          workflow_run_id: string | null
        }
        Insert: {
          cancelled_at?: string | null
          created_at?: string
          draft_pdf_url?: string | null
          end_date?: string | null
          id?: string
          is_adhesion?: boolean | null
          metadata?: Json | null
          moneda?: string | null
          monto?: number | null
          owner_email?: string | null
          periodicidad?: string | null
          preaviso_dias?: number | null
          provider_id: string
          renovacion_automatica?: boolean | null
          signed_at?: string | null
          signed_pdf_url?: string | null
          signnow_document_id?: string | null
          sociedad_contratante?: string | null
          start_date?: string | null
          status?: string
          tipo_contrato?: string | null
          tipo_duracion?: string | null
          updated_at?: string
          vigencia_meses?: number | null
          workflow_run_id?: string | null
        }
        Update: {
          cancelled_at?: string | null
          created_at?: string
          draft_pdf_url?: string | null
          end_date?: string | null
          id?: string
          is_adhesion?: boolean | null
          metadata?: Json | null
          moneda?: string | null
          monto?: number | null
          owner_email?: string | null
          periodicidad?: string | null
          preaviso_dias?: number | null
          provider_id?: string
          renovacion_automatica?: boolean | null
          signed_at?: string | null
          signed_pdf_url?: string | null
          signnow_document_id?: string | null
          sociedad_contratante?: string | null
          start_date?: string | null
          status?: string
          tipo_contrato?: string | null
          tipo_duracion?: string | null
          updated_at?: string
          vigencia_meses?: number | null
          workflow_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contracts_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_workflow_run_id_fkey"
            columns: ["workflow_run_id"]
            isOneToOne: false
            referencedRelation: "v_workflow_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_workflow_run_id_fkey"
            columns: ["workflow_run_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      docs_checklist: {
        Row: {
          doc_id: string
          doc_name: string
          drive_file_id: string | null
          expires_at: string | null
          id: string
          uploaded: boolean
          uploaded_at: string | null
          validated: boolean
          workflow_run_id: string
        }
        Insert: {
          doc_id: string
          doc_name: string
          drive_file_id?: string | null
          expires_at?: string | null
          id?: string
          uploaded?: boolean
          uploaded_at?: string | null
          validated?: boolean
          workflow_run_id: string
        }
        Update: {
          doc_id?: string
          doc_name?: string
          drive_file_id?: string | null
          expires_at?: string | null
          id?: string
          uploaded?: boolean
          uploaded_at?: string | null
          validated?: boolean
          workflow_run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "docs_checklist_workflow_run_id_fkey"
            columns: ["workflow_run_id"]
            isOneToOne: false
            referencedRelation: "v_workflow_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "docs_checklist_workflow_run_id_fkey"
            columns: ["workflow_run_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      extractions: {
        Row: {
          cost_usd: number | null
          created_at: string
          extracted_json: Json
          id: string
          model: string
          risks_count: number | null
          source_pdf_hash: string
          source_pdf_url: string | null
          tokens_in: number | null
          tokens_out: number | null
          workflow_run_id: string | null
        }
        Insert: {
          cost_usd?: number | null
          created_at?: string
          extracted_json: Json
          id?: string
          model: string
          risks_count?: number | null
          source_pdf_hash: string
          source_pdf_url?: string | null
          tokens_in?: number | null
          tokens_out?: number | null
          workflow_run_id?: string | null
        }
        Update: {
          cost_usd?: number | null
          created_at?: string
          extracted_json?: Json
          id?: string
          model?: string
          risks_count?: number | null
          source_pdf_hash?: string
          source_pdf_url?: string | null
          tokens_in?: number | null
          tokens_out?: number | null
          workflow_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "extractions_workflow_run_id_fkey"
            columns: ["workflow_run_id"]
            isOneToOne: false
            referencedRelation: "v_workflow_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extractions_workflow_run_id_fkey"
            columns: ["workflow_run_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      file_comment_mentions: {
        Row: {
          comment_id: string
          created_at: string
          id: string
          mentioned_email: string
          mentioned_id: string | null
          read_at: string | null
        }
        Insert: {
          comment_id: string
          created_at?: string
          id?: string
          mentioned_email: string
          mentioned_id?: string | null
          read_at?: string | null
        }
        Update: {
          comment_id?: string
          created_at?: string
          id?: string
          mentioned_email?: string
          mentioned_id?: string | null
          read_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "file_comment_mentions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "file_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      file_comments: {
        Row: {
          anchor_meta: Json | null
          anchor_text: string | null
          author_email: string
          author_id: string | null
          body: string
          created_at: string
          deleted_at: string | null
          file_id: string
          id: string
          page_number: number | null
          parent_id: string | null
          resolved: boolean
          updated_at: string
          workflow_run_id: string
        }
        Insert: {
          anchor_meta?: Json | null
          anchor_text?: string | null
          author_email: string
          author_id?: string | null
          body: string
          created_at?: string
          deleted_at?: string | null
          file_id: string
          id?: string
          page_number?: number | null
          parent_id?: string | null
          resolved?: boolean
          updated_at?: string
          workflow_run_id: string
        }
        Update: {
          anchor_meta?: Json | null
          anchor_text?: string | null
          author_email?: string
          author_id?: string | null
          body?: string
          created_at?: string
          deleted_at?: string | null
          file_id?: string
          id?: string
          page_number?: number | null
          parent_id?: string | null
          resolved?: boolean
          updated_at?: string
          workflow_run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "file_comments_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "contract_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "file_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_comments_workflow_run_id_fkey"
            columns: ["workflow_run_id"]
            isOneToOne: false
            referencedRelation: "v_workflow_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_comments_workflow_run_id_fkey"
            columns: ["workflow_run_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          delivered_email: boolean | null
          delivered_slack: boolean | null
          id: string
          kind: string
          payload: Json
          read_at: string | null
          recipient_email: string
          recipient_id: string | null
          workflow_run_id: string | null
        }
        Insert: {
          created_at?: string
          delivered_email?: boolean | null
          delivered_slack?: boolean | null
          id?: string
          kind: string
          payload?: Json
          read_at?: string | null
          recipient_email: string
          recipient_id?: string | null
          workflow_run_id?: string | null
        }
        Update: {
          created_at?: string
          delivered_email?: boolean | null
          delivered_slack?: boolean | null
          id?: string
          kind?: string
          payload?: Json
          read_at?: string | null
          recipient_email?: string
          recipient_id?: string | null
          workflow_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_workflow_run_id_fkey"
            columns: ["workflow_run_id"]
            isOneToOne: false
            referencedRelation: "v_workflow_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_workflow_run_id_fkey"
            columns: ["workflow_run_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_uploads: {
        Row: {
          created_at: string
          doc_filename: string
          doc_type: string
          file_size: number | null
          file_url: string
          id: string
          provider_id: string
          rag_error: string | null
          rag_extracted: Json | null
          rag_status: string | null
          uploaded_by_email: string | null
          validation_notes: string | null
          validation_status: string | null
          workflow_run_id: string | null
        }
        Insert: {
          created_at?: string
          doc_filename: string
          doc_type: string
          file_size?: number | null
          file_url: string
          id?: string
          provider_id: string
          rag_error?: string | null
          rag_extracted?: Json | null
          rag_status?: string | null
          uploaded_by_email?: string | null
          validation_notes?: string | null
          validation_status?: string | null
          workflow_run_id?: string | null
        }
        Update: {
          created_at?: string
          doc_filename?: string
          doc_type?: string
          file_size?: number | null
          file_url?: string
          id?: string
          provider_id?: string
          rag_error?: string | null
          rag_extracted?: Json | null
          rag_status?: string | null
          uploaded_by_email?: string | null
          validation_notes?: string | null
          validation_status?: string | null
          workflow_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "provider_uploads_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_uploads_workflow_run_id_fkey"
            columns: ["workflow_run_id"]
            isOneToOne: false
            referencedRelation: "v_workflow_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_uploads_workflow_run_id_fkey"
            columns: ["workflow_run_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      providers: {
        Row: {
          created_at: string
          criticidad: string | null
          domicilio: string | null
          drive_folder_id: string | null
          email_contacto: string | null
          email_facturacion: string | null
          id: string
          metadata: Json | null
          nivel_acceso: string | null
          pais: string
          profile_completed_at: string | null
          profile_data: Json | null
          profile_invited_at: string | null
          profile_last_filled_by_email: string | null
          public_token: string | null
          razon_social: string
          representante_legal: string | null
          servicio_descripcion: string | null
          sociedad_contratante: string | null
          status: string
          tax_id: string
          tipo_proveedor: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          criticidad?: string | null
          domicilio?: string | null
          drive_folder_id?: string | null
          email_contacto?: string | null
          email_facturacion?: string | null
          id?: string
          metadata?: Json | null
          nivel_acceso?: string | null
          pais: string
          profile_completed_at?: string | null
          profile_data?: Json | null
          profile_invited_at?: string | null
          profile_last_filled_by_email?: string | null
          public_token?: string | null
          razon_social: string
          representante_legal?: string | null
          servicio_descripcion?: string | null
          sociedad_contratante?: string | null
          status?: string
          tax_id: string
          tipo_proveedor?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          criticidad?: string | null
          domicilio?: string | null
          drive_folder_id?: string | null
          email_contacto?: string | null
          email_facturacion?: string | null
          id?: string
          metadata?: Json | null
          nivel_acceso?: string | null
          pais?: string
          profile_completed_at?: string | null
          profile_data?: Json | null
          profile_invited_at?: string | null
          profile_last_filled_by_email?: string | null
          public_token?: string | null
          razon_social?: string
          representante_legal?: string | null
          servicio_descripcion?: string | null
          sociedad_contratante?: string | null
          status?: string
          tax_id?: string
          tipo_proveedor?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      regcheq_checks: {
        Row: {
          company: Json | null
          created_at: string | null
          decision: string
          id: string
          provider_id: string | null
          reason: string | null
          relations: Json | null
          workflow_run_id: string | null
        }
        Insert: {
          company?: Json | null
          created_at?: string | null
          decision: string
          id?: string
          provider_id?: string | null
          reason?: string | null
          relations?: Json | null
          workflow_run_id?: string | null
        }
        Update: {
          company?: Json | null
          created_at?: string | null
          decision?: string
          id?: string
          provider_id?: string | null
          reason?: string | null
          relations?: Json | null
          workflow_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "regcheq_checks_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regcheq_checks_workflow_run_id_fkey"
            columns: ["workflow_run_id"]
            isOneToOne: false
            referencedRelation: "v_workflow_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regcheq_checks_workflow_run_id_fkey"
            columns: ["workflow_run_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      regcheq_raw_callbacks: {
        Row: {
          body: Json | null
          created_at: string | null
          headers: Json | null
          id: string
          method: string | null
          query: Json | null
          ref: string | null
        }
        Insert: {
          body?: Json | null
          created_at?: string | null
          headers?: Json | null
          id?: string
          method?: string | null
          query?: Json | null
          ref?: string | null
        }
        Update: {
          body?: Json | null
          created_at?: string | null
          headers?: Json | null
          id?: string
          method?: string | null
          query?: Json | null
          ref?: string | null
        }
        Relationships: []
      }
      sanctions_checks: {
        Row: {
          created_at: string
          hit: boolean
          id: string
          matches: Json | null
          raw_response: Json | null
          workflow_run_id: string | null
        }
        Insert: {
          created_at?: string
          hit: boolean
          id?: string
          matches?: Json | null
          raw_response?: Json | null
          workflow_run_id?: string | null
        }
        Update: {
          created_at?: string
          hit?: boolean
          id?: string
          matches?: Json | null
          raw_response?: Json | null
          workflow_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sanctions_checks_workflow_run_id_fkey"
            columns: ["workflow_run_id"]
            isOneToOne: false
            referencedRelation: "v_workflow_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sanctions_checks_workflow_run_id_fkey"
            columns: ["workflow_run_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      sociedad_documents: {
        Row: {
          active: boolean
          created_at: string
          id: string
          kind: string
          name: string
          required: boolean
          sociedad_id: string
          sort_order: number
          valid_months: number | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          kind?: string
          name: string
          required?: boolean
          sociedad_id: string
          sort_order?: number
          valid_months?: number | null
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          kind?: string
          name?: string
          required?: boolean
          sociedad_id?: string
          sort_order?: number
          valid_months?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sociedad_documents_sociedad_id_fkey"
            columns: ["sociedad_id"]
            isOneToOne: false
            referencedRelation: "sociedades"
            referencedColumns: ["id"]
          },
        ]
      }
      sociedades: {
        Row: {
          active: boolean
          country: string
          created_at: string
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          country: string
          created_at?: string
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          country?: string
          created_at?: string
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string
          roles: string[]
          sociedades: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email: string
          roles?: string[]
          sociedades?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string
          roles?: string[]
          sociedades?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      workflow_runs: {
        Row: {
          active_phases: Json | null
          apoderados_firmantes: Json | null
          created_at: string
          criticidad: string | null
          current_phase: string
          draft_url: string | null
          drive_folder_id: string | null
          fecha_fin: string | null
          fecha_inicio: string | null
          finnecto_contract_id: string | null
          finnecto_supplier_id: string | null
          form_response_id: string
          id: string
          internal_approval_comment: string | null
          internal_approval_status: string | null
          internal_approvals_completed_at: string | null
          internal_approved_at: string | null
          internal_approver_email: string | null
          is_adhesion: boolean | null
          justificacion: string | null
          metadata: Json | null
          moneda: string | null
          monto: number | null
          nivel_acceso: string | null
          owner_email: string
          owner_es_solicitante: boolean | null
          owner_nombre: string | null
          pais: string
          periodicidad: string | null
          proveedor_existente: boolean | null
          provider_data_completed_at: string | null
          razon_social: string
          representante_legal: string | null
          responsable_backup_email: string | null
          semaforo: string | null
          servicio_descripcion: string | null
          signnow_document_id: string | null
          sociedad_apoderado_email: string | null
          sociedad_contratante: string | null
          solicitante_area: string | null
          solicitante_email: string | null
          solicitante_nombre: string | null
          tax_id: string
          tipo_contrato: string | null
          tipo_duracion: string | null
          tipo_proveedor: string | null
          updated_at: string
          vigencia_meses: number | null
        }
        Insert: {
          active_phases?: Json | null
          apoderados_firmantes?: Json | null
          created_at?: string
          criticidad?: string | null
          current_phase?: string
          draft_url?: string | null
          drive_folder_id?: string | null
          fecha_fin?: string | null
          fecha_inicio?: string | null
          finnecto_contract_id?: string | null
          finnecto_supplier_id?: string | null
          form_response_id: string
          id?: string
          internal_approval_comment?: string | null
          internal_approval_status?: string | null
          internal_approvals_completed_at?: string | null
          internal_approved_at?: string | null
          internal_approver_email?: string | null
          is_adhesion?: boolean | null
          justificacion?: string | null
          metadata?: Json | null
          moneda?: string | null
          monto?: number | null
          nivel_acceso?: string | null
          owner_email: string
          owner_es_solicitante?: boolean | null
          owner_nombre?: string | null
          pais: string
          periodicidad?: string | null
          proveedor_existente?: boolean | null
          provider_data_completed_at?: string | null
          razon_social: string
          representante_legal?: string | null
          responsable_backup_email?: string | null
          semaforo?: string | null
          servicio_descripcion?: string | null
          signnow_document_id?: string | null
          sociedad_apoderado_email?: string | null
          sociedad_contratante?: string | null
          solicitante_area?: string | null
          solicitante_email?: string | null
          solicitante_nombre?: string | null
          tax_id: string
          tipo_contrato?: string | null
          tipo_duracion?: string | null
          tipo_proveedor?: string | null
          updated_at?: string
          vigencia_meses?: number | null
        }
        Update: {
          active_phases?: Json | null
          apoderados_firmantes?: Json | null
          created_at?: string
          criticidad?: string | null
          current_phase?: string
          draft_url?: string | null
          drive_folder_id?: string | null
          fecha_fin?: string | null
          fecha_inicio?: string | null
          finnecto_contract_id?: string | null
          finnecto_supplier_id?: string | null
          form_response_id?: string
          id?: string
          internal_approval_comment?: string | null
          internal_approval_status?: string | null
          internal_approvals_completed_at?: string | null
          internal_approved_at?: string | null
          internal_approver_email?: string | null
          is_adhesion?: boolean | null
          justificacion?: string | null
          metadata?: Json | null
          moneda?: string | null
          monto?: number | null
          nivel_acceso?: string | null
          owner_email?: string
          owner_es_solicitante?: boolean | null
          owner_nombre?: string | null
          pais?: string
          periodicidad?: string | null
          proveedor_existente?: boolean | null
          provider_data_completed_at?: string | null
          razon_social?: string
          representante_legal?: string | null
          responsable_backup_email?: string | null
          semaforo?: string | null
          servicio_descripcion?: string | null
          signnow_document_id?: string | null
          sociedad_apoderado_email?: string | null
          sociedad_contratante?: string | null
          solicitante_area?: string | null
          solicitante_email?: string | null
          solicitante_nombre?: string | null
          tax_id?: string
          tipo_contrato?: string | null
          tipo_duracion?: string | null
          tipo_proveedor?: string | null
          updated_at?: string
          vigencia_meses?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      v_avg_approval_time: {
        Row: {
          approved: number | null
          avg_hours_to_decide: number | null
          rejected: number | null
          requested_changes: number | null
          team: string | null
          total_decisions: number | null
        }
        Relationships: []
      }
      v_contracts_by_status: {
        Row: {
          status: string | null
          total: number | null
          total_amount_sum: number | null
          unique_providers: number | null
        }
        Relationships: []
      }
      v_expiring_contracts: {
        Row: {
          amount: number | null
          currency: string | null
          days_until_expiry: number | null
          expires_at: string | null
          id: string | null
          owner_email: string | null
          provider_id: string | null
          provider_name: string | null
          status: string | null
          tax_id: string | null
          type: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contracts_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      v_extraction_costs: {
        Row: {
          cost_usd_total: number | null
          day: string | null
          extractions: number | null
          model: string | null
          tokens_in_sum: number | null
          tokens_out_sum: number | null
        }
        Relationships: []
      }
      v_providers_by_country: {
        Row: {
          aceptados: number | null
          pais: string | null
          pendientes: number | null
          rechazados: number | null
          total: number | null
        }
        Relationships: []
      }
      v_runs_by_phase: {
        Row: {
          current_phase: string | null
          green: number | null
          red: number | null
          total: number | null
          yellow: number | null
        }
        Relationships: []
      }
      v_sanctions_hits: {
        Row: {
          checks: number | null
          hit_pct: number | null
          hits: number | null
          week: string | null
        }
        Relationships: []
      }
      v_unread_notifications: {
        Row: {
          latest_unread_at: string | null
          recipient_email: string | null
          unread_count: number | null
        }
        Relationships: []
      }
      v_workflow_stage: {
        Row: {
          created_at: string | null
          current_phase: string | null
          id: string | null
          internal_approval_status: string | null
          razon_social: string | null
          sociedad_contratante: string | null
          stage: string | null
          tax_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          current_phase?: string | null
          id?: string | null
          internal_approval_status?: string | null
          razon_social?: string | null
          sociedad_contratante?: string | null
          stage?: never
          tax_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          current_phase?: string | null
          id?: string | null
          internal_approval_status?: string | null
          razon_social?: string | null
          sociedad_contratante?: string | null
          stage?: never
          tax_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      current_user_email: { Args: never; Returns: string }
      current_user_roles: { Args: never; Returns: string[] }
      current_user_sociedades: { Args: never; Returns: string[] }
      has_role: { Args: { role_name: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
