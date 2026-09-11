# Cycle — a private period tracker

A small PWA that predicts her next period, fertile window, and keeps a
shared log between two phones. No app store, no accounts beyond a shared
passcode, no third party seeing the data — just your AWS account.

## How it works

- **Frontend** (`frontend/`): a plain HTML/CSS/JS PWA. All the prediction
  math (`frontend/js/cycle.js`) runs on-device. Installs to a phone's home
  screen like a native app via "Add to Home Screen" — no App Store.
- **Backend** (`backend/`): one Lambda function behind API Gateway, storing
  logged dates in DynamoDB so both phones see the same history. Requests
  need a shared passcode header or they're rejected (401).
- Everything is defined in Terraform (`backend/terraform/`) so it's one
  `apply` to stand up and one `destroy` to tear down.

Cost: this sits comfortably in the AWS free tier for two people (DynamoDB
on-demand, Lambda, S3, CloudFront). Expect well under $1/month even off
the free tier.

## One-time setup

You'll need: an AWS account with credentials configured (`aws configure`
or SSO), Terraform >= 1.5, Node.js >= 18, and the AWS CLI.

### 1. Install Lambda dependencies

```
cd backend/lambda
npm install --omit=dev
```

### 2. Set your passcode

```
cd ../terraform
cat > terraform.tfvars <<'EOF'
passcode = "choose-something-only-you-two-know"
EOF
```

Don't commit `terraform.tfvars` — it has the passcode in it. A `.gitignore`
is included that excludes it.

### 3. Deploy the backend + hosting infrastructure

```
terraform init
terraform apply
```

Review the plan, type `yes`. Note the outputs when it finishes —
`api_base_url` and `site_url` — you'll need both next.

### 4. Point the frontend at the API

Edit `frontend/js/config.js`:

```js
export const API_BASE_URL = 'https://<api_base_url output>';
```

### 5. Upload the frontend to S3

```
cd ../../frontend
aws s3 sync . s3://$(terraform -chdir=../backend/terraform output -raw site_bucket_name) \
  --delete --exclude "icons/generate_icons.py" --exclude "js/test-cycle.mjs"

aws cloudfront create-invalidation \
  --distribution-id $(terraform -chdir=../backend/terraform output -raw cloudfront_distribution_id) \
  --paths "/*"
```

### 6. Install it on her phone

Open the `site_url` from the terraform output in her phone's browser.

- **iPhone**: open in Safari → Share icon → "Add to Home Screen"
- **Android**: open in Chrome → ⋮ menu → "Install app" (or "Add to Home
  Screen")

She'll enter the passcode once; it's saved on her phone after that. Do the
same on your own phone with `site_url` to log dates from your end too.

## Updating later

Changed the frontend? Re-run the `aws s3 sync` + `cloudfront
create-invalidation` commands from step 5. Changed the Lambda code? re-run
`terraform apply` from `backend/terraform` (it re-zips and redeploys
automatically because the zip's hash changes).

## Adjusting the predictions

- Default assumed period length: `PERIOD_LENGTH_DAYS` in
  `frontend/js/config.js` (default 5).
- Prediction math (average cycle length, fertile window, luteal phase
  assumption): `frontend/js/cycle.js`, fully commented.
- These are estimates from limited data — the app shows a ± variance once
  there's enough history, and it gets more accurate the more cycles are
  logged.

## Tearing it down

```
cd backend/terraform
terraform destroy
```

This deletes the DynamoDB table (and the logged history with it), so only
do this if you actually want the data gone.

## A note on the passcode

This is deliberately simple: one shared secret, checked by the Lambda,
sent as a header from a saved value on each phone. It's appropriate for
"just the two of us" and keeps things unguessable to anyone else who
doesn't know the site URL *and* the passcode — but it isn't enterprise
auth. If you ever wanted to harden it, swapping in Cognito (which you've
already used on the Polly project) is the natural next step.
