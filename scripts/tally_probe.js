import 'dotenv/config';
const KEY = process.env.TALLY_API_KEY;
async function tryForm(name, blocks) {
  const r = await fetch('https://api.tally.so/forms', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'DRAFT', blocks }),
  });
  const txt = await r.text();
  console.log(`[${name}] ${r.status}`);
  console.log('  ' + txt.slice(0, 350));
  if (r.ok) console.log('  → ID:', JSON.parse(txt).id);
}
const u = () => crypto.randomUUID();

// Solo options, no parent block. Group identified by groupUuid + groupType=DROPDOWN
{
  const t = u(); const g = u();
  await tryForm('only-options-with-isFirst', [
    { uuid: t, type: 'FORM_TITLE', groupUuid: t, groupType: 'FORM_TITLE', payload: { html: 'T' } },
    { uuid: u(), type: 'TITLE', groupUuid: u(), groupType: 'TITLE', payload: { html: 'País' } },
    { uuid: u(), type: 'DROPDOWN_OPTION', groupUuid: g, groupType: 'DROPDOWN', payload: { text: 'CL', index: 0, isFirst: true, isLast: false, isRequired: true } },
    { uuid: u(), type: 'DROPDOWN_OPTION', groupUuid: g, groupType: 'DROPDOWN', payload: { text: 'PE', index: 1, isFirst: false, isLast: true } },
  ]);
}

{
  const t = u(); const g = u();
  await tryForm('multiple-choice-options-only', [
    { uuid: t, type: 'FORM_TITLE', groupUuid: t, groupType: 'FORM_TITLE', payload: { html: 'T' } },
    { uuid: u(), type: 'TITLE', groupUuid: u(), groupType: 'TITLE', payload: { html: 'Adhesión' } },
    { uuid: u(), type: 'MULTIPLE_CHOICE_OPTION', groupUuid: g, groupType: 'MULTIPLE_CHOICE', payload: { text: 'Sí', index: 0, isFirst: true, isLast: false, isRequired: true } },
    { uuid: u(), type: 'MULTIPLE_CHOICE_OPTION', groupUuid: g, groupType: 'MULTIPLE_CHOICE', payload: { text: 'No', index: 1, isFirst: false, isLast: true } },
  ]);
}
