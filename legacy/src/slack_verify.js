// Verifica firma HMAC de Slack en requests interactivos.
// https://api.slack.com/authentication/verifying-requests-from-slack

import crypto from 'node:crypto';

const VERSION = 'v0';
const MAX_AGE_SECONDS = 60 * 5;

export function verifySlackSignature(rawBody, headers) {
  const ts = headers['x-slack-request-timestamp'];
  const sig = headers['x-slack-signature'];
  const secret = process.env.SLACK_SIGNING_SECRET;
  if (!ts || !sig || !secret) return false;

  if (Math.abs(Date.now() / 1000 - Number(ts)) > MAX_AGE_SECONDS) return false;

  const base = `${VERSION}:${ts}:${rawBody}`;
  const expected = `${VERSION}=` + crypto.createHmac('sha256', secret).update(base).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
  } catch {
    return false;
  }
}
