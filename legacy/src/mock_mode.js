// Modo mock global. Activar con MOCK_MODE=true en .env.
// Útil para piloto local sin creds reales (Finnecto, SignNow, OpenSanctions).

export const MOCK = process.env.MOCK_MODE === 'true';

export function mockFinnectoCreateForm(payload) {
  return {
    id: `mock-form-resp-${Date.now()}`,
    form_id: payload.form_id,
    provider_id: `mock-prov-${Math.random().toString(36).slice(2, 9)}`,
    status: 'Pendiente de Revisión',
    created_at: new Date().toISOString(),
    responses: payload.responses,
  };
}

export function mockFinnectoContracts() {
  return {
    results: [
      {
        id: 'mock-c-001',
        provider_id: 'mock-prov-001',
        provider_name: 'ACME SpA',
        type: 'servicios',
        amount: 12000,
        currency: 'USD',
        status: 'active',
        start_date: new Date(Date.now() - 90 * 86400 * 1000).toISOString(),
        end_date: new Date(Date.now() + 95 * 86400 * 1000).toISOString(),
        url: 'https://app.finnecto.com/contracts/mock-c-001',
        owner_slack_id: null,
      },
    ],
  };
}

export function mockSanctions(supplier) {
  const flagged = (supplier.razon_social ?? '').toLowerCase().includes('sancionado');
  return {
    hit: flagged,
    matches: flagged ? [{ id: 'mock-1', score: 0.95, caption: 'Mock match', datasets: ['mock'], topics: ['sanction'] }] : [],
  };
}

export function mockSignNow() {
  return {
    documentId: `mock-sn-${Date.now()}`,
    inviteSent: true,
    publicUrl: 'https://signnow.com/mock',
  };
}

export function mockDriveFolder(supplier) {
  return {
    id: `mock-drive-${Date.now()}`,
    url: `https://drive.google.com/drive/folders/mock-${supplier.tax_id}`,
  };
}

export function mockClaudeExtraction() {
  return {
    partes: {
      proveedor: { razon_social: 'ACME SpA', tax_id: '76.000.000-K', domicilio: 'Av. Test 123', representante_legal: 'Juan Pérez' },
      cliente: { razon_social: 'Global66', tax_id: '76.999.999-9' },
    },
    objeto: 'Servicios de prueba para piloto',
    tipo_contrato: 'servicios',
    monto: { valor: 12000, moneda: 'USD', periodicidad: 'anual' },
    vigencia: { inicio: '2026-06-01', fin: '2027-06-01', duracion_meses: 12, renovacion_automatica: true, preaviso_dias: 30 },
    obligaciones_clave: ['Entrega mensual', 'SLA 99.5%'],
    penalidades: ['Multa 1% por día de atraso'],
    confidencialidad: { tiene_clausula: true, duracion_post_termino_meses: 24 },
    ley_aplicable: 'Chile',
    jurisdiccion: 'Santiago',
    anti_corrupcion: true,
    proteccion_datos: true,
    riesgos_detectados: [
      { tipo: 'renovacion_tacita', descripcion: 'Renueva sin preaviso del cliente', severidad: 'media' },
    ],
    checklist_compliance: {
      tiene_clausula_anti_lavado: true,
      tiene_clausula_proteccion_datos: true,
      permite_auditoria: false,
      limita_responsabilidad_proveedor: true,
    },
  };
}
