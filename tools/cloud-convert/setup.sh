#!/usr/bin/env bash
# home movie: تجهيز التحويل التلقائي على Google Cloud (يشتغل في Cloud Shell)
set -euo pipefail
FOLDER_ID="1myjZwEinh1P9D7Lc276qx5QfbF7N_96Y"
REGION="europe-west1"
JOB="hm-convert"
SRC="https://raw.githubusercontent.com/mibxmib-dev/maktabati/main/tools/cloud-convert"

PROJECT="${GOOGLE_CLOUD_PROJECT:-$(gcloud config get-value project 2>/dev/null)}"
if [ -z "$PROJECT" ]; then echo "اختر المشروع أول: gcloud config set project PROJECT_ID"; exit 1; fi
echo "== المشروع: $PROJECT"
gcloud config set project "$PROJECT" >/dev/null

BILL=$(gcloud billing projects describe "$PROJECT" --format='value(billingEnabled)' 2>/dev/null || echo "")
if [ "$BILL" = "False" ]; then echo "!! الفوترة مو مفعّلة على هذا المشروع. فعّلها من Billing ثم شغّل الأمر مرة ثانية."; exit 1; fi

echo "== تفعيل الخدمات (دقيقة أو دقيقتين)"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com cloudscheduler.googleapis.com drive.googleapis.com >/dev/null

SA_NAME="hm-converter"; SA="$SA_NAME@$PROJECT.iam.gserviceaccount.com"
gcloud iam service-accounts describe "$SA" >/dev/null 2>&1 || gcloud iam service-accounts create "$SA_NAME" --display-name="home movie converter" >/dev/null
gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$SA" --role="roles/run.invoker" --condition=None >/dev/null
PNUM=$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')
gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$PNUM-compute@developer.gserviceaccount.com" --role="roles/run.builder" --condition=None >/dev/null 2>&1 || true

echo "== تنزيل ملفات البرنامج"
W=$(mktemp -d); cd "$W"
curl -fsSL "$SRC/Dockerfile" -o Dockerfile
curl -fsSL "$SRC/main.py" -o main.py

echo "== بناء البرنامج ورفعه (3-6 دقائق)"
gcloud run jobs deploy "$JOB" --source . --region "$REGION" --service-account "$SA" \
  --cpu 2 --memory 8Gi --task-timeout 6h --max-retries 0 \
  --set-env-vars "FOLDER_ID=$FOLDER_ID,MAX_FILES=6,ENHANCE=0" --quiet

echo "== المنبّه: كل 30 دقيقة"
URI="https://run.googleapis.com/v2/projects/$PROJECT/locations/$REGION/jobs/$JOB:run"
if gcloud scheduler jobs describe "$JOB-every-30m" --location "$REGION" >/dev/null 2>&1; then
  gcloud scheduler jobs update http "$JOB-every-30m" --location "$REGION" --schedule "*/30 * * * *" --uri "$URI" --http-method POST --oauth-service-account-email "$SA" >/dev/null
else
  gcloud scheduler jobs create http "$JOB-every-30m" --location "$REGION" --schedule "*/30 * * * *" --time-zone "Asia/Riyadh" --uri "$URI" --http-method POST --oauth-service-account-email "$SA" >/dev/null
fi

echo ""
echo "=================================================================="
echo " تم التجهيز."
echo " الخطوة الأخيرة: شارك مجلد المكتبة في Drive مع هذا الإيميل كـ «محرر» (Editor):"
echo ""
echo "   $SA"
echo ""
echo " بعدها التحويل يشتغل لحاله كل نص ساعة."
echo " تبي تجربه الحين؟ اكتب:  gcloud run jobs execute $JOB --region $REGION"
echo "=================================================================="
