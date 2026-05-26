// Crea usuario en Supabase Auth + lo marca como admin via app_metadata.
// Uso: node --env-file=.env scripts/create_admin.js email@global66.com [password]
// Si no se pasa password, se manda magic link.

import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY;
if (!URL || !KEY) { console.error('Missing SUPABASE_URL or SUPABASE_KEY'); process.exit(1); }

const sb = createClient(URL, KEY, { auth: { persistSession: false } });

const email = process.argv[2];
const password = process.argv[3];
const role = process.argv[4] ?? 'admin';

if (!email) {
  console.error('Usage: node scripts/create_admin.js <email> [password] [role]');
  process.exit(1);
}

async function main() {
  // Check if user exists
  const { data: { users }, error: listErr } = await sb.auth.admin.listUsers();
  if (listErr) { console.error('listUsers error:', listErr.message); process.exit(1); }
  let user = users.find((u) => u.email === email);

  if (user) {
    console.log(`✓ User exists: ${email} (${user.id})`);
    const updatePayload = {
      app_metadata: { ...(user.app_metadata ?? {}), role },
    };
    if (password) updatePayload.password = password;
    const { error: upErr } = await sb.auth.admin.updateUserById(user.id, updatePayload);
    if (upErr) { console.error('updateUser error:', upErr.message); process.exit(1); }
    console.log(`✓ Role set: ${role}`);
    if (password) console.log('✓ Password updated');
  } else {
    const createPayload = {
      email,
      email_confirm: true,
      app_metadata: { role },
    };
    if (password) createPayload.password = password;

    const { data, error } = await sb.auth.admin.createUser(createPayload);
    if (error) { console.error('createUser error:', error.message); process.exit(1); }
    user = data.user;
    console.log(`✓ User created: ${email} (${user.id})`);
    console.log(`✓ Role set: ${role}`);
  }

  if (!password) {
    const { data, error } = await sb.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });
    if (error) console.error('generateLink error:', error.message);
    else console.log(`✓ Magic link: ${data.properties?.action_link}`);
  } else {
    console.log(`✓ Password set. Login con email + password.`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
