'use strict';
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Crear un nuevo contrato en estado pendiente
async function crearContrato(datos) {
  const { data, error } = await supabase
    .from('contratos')
    .insert([{
      ...datos,
      aprobaciones: { compliance: null, legal: null, administracion: null },
      finecto_registrado: false,
    }])
    .select()
    .single();

  if (error) throw new Error(`[Supabase] Error al crear contrato: ${error.message}`);
  return data;
}

// Actualizar la aprobación de un departamento y recalcular el estado general
async function actualizarAprobacion(contratoId, departamento, decision, actor) {
  const contrato = await obtenerContrato(contratoId);
  const aprobaciones = { ...contrato.aprobaciones, [departamento]: decision };

  let estado = 'pendiente';
  const valores = Object.values(aprobaciones);
  if (valores.every(v => v === 'aprobado')) estado = 'aprobado';
  if (valores.some(v => v === 'rechazado'))  estado = 'rechazado';

  const { data, error } = await supabase
    .from('contratos')
    .update({ aprobaciones, estado, updated_at: new Date().toISOString() })
    .eq('id', contratoId)
    .select()
    .single();

  if (error) throw new Error(`[Supabase] Error al actualizar aprobación: ${error.message}`);
  return data;
}

// Insertar una fila en el historial de estados para trazabilidad
async function registrarEstado(contratoId, estadoAnterior, estadoNuevo, actor, comentario = null) {
  const { error } = await supabase
    .from('estados')
    .insert([{ contrato_id: contratoId, estado_anterior: estadoAnterior, estado_nuevo: estadoNuevo, actor, comentario }]);

  if (error) throw new Error(`[Supabase] Error al registrar estado: ${error.message}`);
}

// Obtener un contrato por su UUID
async function obtenerContrato(contratoId) {
  const { data, error } = await supabase
    .from('contratos')
    .select('*')
    .eq('id', contratoId)
    .single();

  if (error) throw new Error(`[Supabase] Error al obtener contrato: ${error.message}`);
  return data;
}

// Marcar que el contrato ya fue creado en Finecto
async function marcarRegistradoFinecto(contratoId) {
  const { error } = await supabase
    .from('contratos')
    .update({ finecto_registrado: true, updated_at: new Date().toISOString() })
    .eq('id', contratoId);

  if (error) throw new Error(`[Supabase] Error al marcar Finecto: ${error.message}`);
}

module.exports = { crearContrato, actualizarAprobacion, registrarEstado, obtenerContrato, marcarRegistradoFinecto };
