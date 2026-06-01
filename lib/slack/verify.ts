import 'server-only';
import crypto from 'node:crypto';

// Verifica firma HMAC de requests interactivos de Slack.
// https://api.slack.com/authentication/verifying-requests-from-slack
const VERSION = 'v0';
const MAX_AGE_SECONDS = 60 * 5;

export function verifySlackSignature(rawBody: string, headers: Headers): boolean {
  const ts = headers.get('x-slack-request-timestamp');
  const sig = headers.get('x-slack-signature');
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
