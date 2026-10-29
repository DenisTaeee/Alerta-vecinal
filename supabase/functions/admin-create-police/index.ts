// Supabase Edge Function: crea una cuenta de policía con permisos de servidor.
// Despliegue: supabase functions deploy admin-create-police
// Configura SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY como secrets.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Método no permitido' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const authHeader = req.headers.get('Authorization') || '';
    const caller = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authError } = await caller.auth.getUser();
    if (authError || !user) return new Response(JSON.stringify({ error: 'No autenticado' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: profile, error: profileError } = await admin.from('profiles').select('role,active').eq('id', user.id).single();
    if (profileError || profile?.role !== 'admin' || profile?.active !== true) return new Response(JSON.stringify({ error: 'Acceso denegado: solo administrador' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const body = await req.json();
    const name = String(body.name || '').trim();
    const phone = String(body.phone || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const station_id = body.station_id || null;
    if (name.length < 2 || phone.length < 7 || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8) {
      return new Response(JSON.stringify({ error: 'Datos inválidos. Verifica nombre, celular, correo y contraseña de al menos 8 caracteres.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const { data: created, error: createError } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: name, phone } });
    if (createError || !created.user) throw createError || new Error('No se pudo crear el usuario');
    // El trigger crea el perfil como vecino por defecto. La función privilegiada asigna el rol.
    const { error: updateError } = await admin.from('profiles').update({ full_name: name, email, phone, role: 'policia', active: true, station_id }).eq('id', created.user.id);
    if (updateError) {
      await admin.auth.admin.deleteUser(created.user.id);
      throw updateError;
    }
    return new Response(JSON.stringify({ ok: true, id: created.user.id, name, email, phone, station_id }), { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Error interno' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
