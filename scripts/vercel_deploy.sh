#!/usr/bin/env bash
# Vercel deploy automatizado: link + env vars + prod deploy.
# Uso: bash scripts/vercel_deploy.sh
# Requiere: VERCEL_TOKEN env var

set -e

if [ -z "$VERCEL_TOKEN" ]; then
  echo "❌ Set VERCEL_TOKEN env var first"
  exit 1
fi

PROJECT="global66-automation-pao"
TOKEN_FLAG="--token=$VERCEL_TOKEN"

echo "→ Link to project..."
npx --yes vercel link --yes --project=$PROJECT $TOKEN_FLAG 2>&1 | tail -3

# Lista de vars a subir (desde .env)
VARS=(
  SLACK_BOT_TOKEN
  SLACK_SIGNING_SECRET
  SLACK_APP_TOKEN
  SUPABASE_URL
  SUPABASE_KEY
  SUPABASE_PUBLISHABLE_KEY
  GEMINI_API_KEY
  GEMINI_MODEL
  GEMINI_MODEL_FLASH
  N8N_BASE_URL
  N8N_WEBHOOK_BASE
  N8N_API_KEY
  TALLY_API_KEY
  GOOGLE_DRIVE_ROOT_FOLDER
  GOOGLE_SERVICE_ACCOUNT_JSON
  RESEND_API_KEY
  RESEND_FROM
  OPENSANCTIONS_API_KEY
  FINNECTO_BASE_URL
  FINNECTO_API_KEY
  NOTION_API_KEY
  NOTION_DB_PROYECTOS
  NOTION_DB_TAREAS
)

# Carga .env
set -a
source .env 2>/dev/null || true
set +a

echo ""
echo "→ Subiendo env vars (production)..."
for v in "${VARS[@]}"; do
  val="${!v}"
  if [ -z "$val" ]; then
    echo "  ⏭  $v (vacío, skip)"
    continue
  fi
  # Vercel env add lee value desde stdin
  printf '%s' "$val" | npx --yes vercel env add $v production $TOKEN_FLAG --force 2>&1 | tail -1 | sed "s/^/  ✓ $v: /"
done

echo ""
echo "→ Deploy production..."
DEPLOY_URL=$(npx --yes vercel deploy --prod --yes $TOKEN_FLAG 2>&1 | tail -3 | grep -oE 'https://[^ ]+vercel.app' | head -1)
echo "Deploy URL: $DEPLOY_URL"

echo ""
echo "→ Verificar..."
sleep 5
curl -sf -w "  /health [%{http_code}]\n" "$DEPLOY_URL/health"
curl -sf -w "  /admin  [%{http_code} %{size_download}b]\n" "$DEPLOY_URL/admin" -o /dev/null
echo ""
echo "✅ Deploy complete"
echo "   URL: $DEPLOY_URL"
