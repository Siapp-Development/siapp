# Runbook — Production Deploys (#57)

Automated CD lives in [.github/workflows/deploy.yml](../.github/workflows/deploy.yml):
every push to `main` (i.e. every merged PR) triggers CI, and when CI is green
the Deploy workflow ships to the `siapp-prod` Firebase project:

| What                       | Source                                   | Target                                                    |
| -------------------------- | ---------------------------------------- | --------------------------------------------------------- |
| Apex web (`/`, `/p`, `/t`) | `apps/web/dist/apex`                     | Hosting site `siapp-prod`                                 |
| Dashboard web              | `apps/web/dist/dashboard`                | Hosting site `siapp-prod-dashboard`                       |
| Admin web                  | `apps/web/dist/admin`                    | Hosting site `siapp-admin`                                |
| Cloud Functions            | `backend/functions` (built by predeploy) | Cloud Functions gen 2, `asia-southeast1`, Node 22         |
| Firestore rules + indexes  | `firestore.rules`, `firestore.indexes.json` | `(default)` database                                   |
| Storage rules              | `storage.rules`                          | Default bucket                                            |

`backend/api` (Express-on-Cloud-Run skeleton) is **not** deployed — nothing
routes to it yet. Add a Cloud Run deploy job when it grows a real endpoint.

A manual re-deploy is available via **Actions → Deploy → Run workflow**
(deploys `main` as-is; useful after fixing a flaky deploy without a new commit).

## One-time setup (user)

### 1. Create the deployer service account

```bash
gcloud iam service-accounts create github-deployer \
  --project siapp-prod \
  --display-name "GitHub Actions deployer"

SA=github-deployer@siapp-prod.iam.gserviceaccount.com

# Hosting, Firestore/Storage rules, indexes
gcloud projects add-iam-policy-binding siapp-prod --member "serviceAccount:$SA" --role roles/firebase.admin
# Cloud Functions gen 2 deploys
gcloud projects add-iam-policy-binding siapp-prod --member "serviceAccount:$SA" --role roles/cloudfunctions.admin
# Needed to act as the functions runtime service account during deploy
gcloud projects add-iam-policy-binding siapp-prod --member "serviceAccount:$SA" --role roles/iam.serviceAccountUser
# Lets the deployer call enabled APIs on the project's behalf
gcloud projects add-iam-policy-binding siapp-prod --member "serviceAccount:$SA" --role roles/serviceusage.serviceUsageConsumer
# Functions bind Secret Manager secrets (defineSecret: POSTMARK_SERVER_TOKEN,
# TWILIO_*) — deploy validates and pins versions, which needs read access.
# Without this the deploy fails with 403 "secretmanager.secrets.get denied".
gcloud projects add-iam-policy-binding siapp-prod --member "serviceAccount:$SA" --role roles/secretmanager.viewer
```

The functions **runtime** service account also needs to read the secret
*values* at run time. Grant it per secret (repeat when adding a new
`defineSecret`):

```bash
PN=$(gcloud projects describe siapp-prod --format='value(projectNumber)')
for s in POSTMARK_SERVER_TOKEN TWILIO_ACCOUNT_SID TWILIO_API_KEY_SECRET TWILIO_API_KEY_SID; do
  gcloud secrets add-iam-policy-binding "$s" --project siapp-prod \
    --member "serviceAccount:${PN}-compute@developer.gserviceaccount.com" \
    --role roles/secretmanager.secretAccessor
done
```

If a functions deploy fails with an Artifact Registry / Cloud Build permission
error, additionally grant `roles/artifactregistry.writer` and
`roles/cloudbuild.builds.editor` to the same member.

### 2. Store the key as a repo secret

```bash
gcloud iam service-accounts keys create /tmp/github-deployer.json --iam-account "$SA"
gh secret set FIREBASE_SERVICE_ACCOUNT --repo Siapp-Development/siapp < /tmp/github-deployer.json
rm /tmp/github-deployer.json
```

The workflow writes the key to a temp file for `GOOGLE_APPLICATION_CREDENTIALS`
and scrubs it after the deploy. Rotate the key by repeating this step and
deleting the old key (`gcloud iam service-accounts keys list/delete`).

> Future hardening: swap the JSON key for Workload Identity Federation
> (keyless). The workflow change is small — replace the "Write deploy
> credentials" step with `google-github-actions/auth@v2`.

### 3. Verify the hosting sites exist

```bash
pnpm exec firebase hosting:sites:list --project siapp-prod
```

Expected sites: `siapp-prod`, `siapp-prod-dashboard`, `siapp-admin` (mapped to
the `apex` / `dashboard` / `admin` targets in [.firebaserc](../.firebaserc)).
Create any missing one with `firebase hosting:sites:create <site-id>`.

### 4. First deploy

Merge any PR (or run the workflow manually) and watch **Actions → Deploy**.
First functions deploy takes several minutes (container builds); subsequent
deploys are incremental.

## Failure playbook

- **CI green but Deploy failed** — fix the cause, then re-run via
  `workflow_dispatch`; no new commit needed.
- **403 `secretmanager.secrets.get` denied** — the deployer SA is missing
  `roles/secretmanager.viewer`, or a new `defineSecret` was added whose secret
  doesn't exist yet (`gcloud secrets create <NAME> --project siapp-prod` then
  `gcloud secrets versions add`). See §1 for the runtime-SA accessor grant.
- **"non-interactive mode but have no value for … <PARAM>"** — a new
  `defineString`/`defineInt` param was added; CI can't prompt for values (code
  defaults don't count). Add the value to
  [backend/functions/.env.siapp-prod](../backend/functions/.env.siapp-prod)
  (committed, public values only — secrets go through `defineSecret`).
- **Functions prompt about deleting a function** — the workflow passes
  `--force`, so removals are applied automatically. If a function disappears
  unexpectedly, check that it's still exported from
  `backend/functions/src/index.ts`.
- **Rules deploy rejected** — Firestore rules compile errors fail the deploy;
  the same rules are exercised by the `rules-tests` CI job, so this should be
  caught pre-merge.
- **Rollback** — hosting: `firebase hosting:rollback` per site (or the
  Firebase console → Hosting → release history). Functions/rules: revert the
  offending PR and let CD redeploy.
