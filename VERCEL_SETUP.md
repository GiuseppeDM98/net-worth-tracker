# Firebase Configuration on Vercel

This guide explains how to properly configure Firebase Admin SDK credentials on Vercel to resolve the "DECODER routines::unsupported" error.

## Problem

When using Firebase Admin SDK on Vercel with separate environment variables (`FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL`, `FIREBASE_ADMIN_PRIVATE_KEY`), you may encounter credential decoding errors like:

```
Error: 2 UNKNOWN: Getting metadata from plugin failed with error: error:1E08010C:DECODER routines::unsupported
```

This happens because special characters in the private key (especially newlines `\n`) can be handled differently on Vercel compared to the local environment.

## Recommended Solution: Use Complete Service Account JSON

### Step 1: Get the Service Account JSON from Firebase

1. Go to the [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Go to **Project Settings** (gear icon) → **Service Accounts**
4. Click **Generate New Private Key**
5. Download the JSON file (e.g., `your-project-firebase-adminsdk.json`)

### Step 2: Configure the Environment Variable on Vercel

1. Go to your project on [Vercel Dashboard](https://vercel.com/dashboard)
2. Go to **Settings** → **Environment Variables**
3. Add a new variable:
   - **Name**: `FIREBASE_SERVICE_ACCOUNT_KEY`
   - **Value**: Copy and paste the **entire contents** of the downloaded JSON file
   - The value should look like this:
     ```json
     {"type":"service_account","project_id":"your-project-id","private_key_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...","client_email":"...","client_id":"...","auth_uri":"...","token_uri":"...","auth_provider_x509_cert_url":"...","client_x509_cert_url":"..."}
     ```
   - **Environment**: Select Production, Preview, and Development
4. Click **Save**

### Step 3: Redeploy

1. Go to the **Deployments** tab
2. Click the three dots on the most recent deployment
3. Select **Redeploy**
4. Confirm the redeploy

## Alternative Solution: Use Separate Variables (Local Development Only)

If you prefer to use separate environment variables for local development, make sure to:

1. Add the following variables to your `.env.local`:
   ```env
   FIREBASE_ADMIN_PROJECT_ID=your_project_id
   FIREBASE_ADMIN_CLIENT_EMAIL=your_service_account_email@your-project.iam.gserviceaccount.com
   FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour private key here\n-----END PRIVATE KEY-----\n"
   ```

2. **IMPORTANT**: The `FIREBASE_ADMIN_PRIVATE_KEY` must include:
   - Double quotes at the beginning and end
   - Literal `\n` characters (not actual newlines)
   - The entire private key between `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----`

## Configuration Verification

After configuring environment variables and redeploying:

1. Test the "Update Prices" functionality from your deployed app
2. Test the "Create Snapshot" functionality
3. Check Vercel logs (Deployments → Select deployment → Functions) for any errors

## Other Required Environment Variables

Don't forget to also configure:

```env
# Firebase Client (public, can be visible)
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id

# Cron Job Secret (to protect scheduled endpoints)
CRON_SECRET=your_secure_random_string

# App URL
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
```

## Troubleshooting

### Error persists after redeploy

1. Verify that the `FIREBASE_SERVICE_ACCOUNT_KEY` variable contains valid JSON
2. Ensure the JSON has no extra spaces or newlines
3. Verify that all environment variables are configured for Production
4. Try removing old `FIREBASE_ADMIN_*` variables to avoid conflicts

### How to verify the JSON is valid

You can use [jsonlint.com](https://jsonlint.com/) to verify the JSON is formatted correctly.

### Error "Firebase Admin credentials not found"

This means neither `FIREBASE_SERVICE_ACCOUNT_KEY` nor individual variables are configured. Follow the steps above to configure at least one of the two options.

## Security

⚠️ **IMPORTANT**:
- Never commit the service account JSON file to the repository
- Never share Firebase credentials publicly
- Always use environment variables for sensitive credentials
- The `firebase-adminsdk-*.json` file should be added to `.gitignore`
