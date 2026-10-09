# Vercel Production Gemini Quota Error Diagnosis & Resolution Plan

This plan analyzes why your Apex Fit deployment on Vercel encountered an HTTP 429 quota exhaustion error even though you have a dedicated Gemini API key with available quota, and outlines the exact steps to verify and fix the configuration.

---

### Root Cause Analysis: Why This Error Occurred in Vercel Production

From inspecting the error logs and backend codebase (`server/app.ts`):
```text
Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, 
limit: 20, model: gemini-3.8-flash. Please retry in 22h58m...
```

1. **Vercel Production Was Using the Wrong API Key (or AI Studio Preview Key)**:
   - The error specifically originated from Google's `generate_content_free_tier_requests` with a hard cap of **20 requests per day**.
   - If your dedicated key was added in Google AI Studio or Google Cloud Console with billing / pay-as-you-go enabled or a higher quota, the fact that Google rejected requests with the **20 req/day limit** indicates that Vercel was either:
     - Missing the `GEMINI_API_KEY` in the **Production Environment** settings (so it fell back to a default project/workspace key or development key), OR
     - The dedicated key in Vercel was generated in a Google Cloud project on the **Free Tier** where preview models (`gemini-3.8-flash`) are restricted to 20 queries/day.

2. **Default Model Assignment in `server/app.ts`**:
   - The server code defaults to:
     ```ts
     const DEFAULT_MODEL = 'gemini-3.8-flash';
     const DEFAULT_FALLBACK_MODELS = ['gemini-3.1-flash-lite'];
     ```
   - On the Free Tier, `gemini-3.8-flash` only grants **20 requests per day per project**.
   - In contrast, standard flash models such as `gemini-2.5-flash` or `gemini-2.0-flash` provide **15 Requests Per Minute (RPM)** and **1,500 Requests Per Day (RPD)** on the free tier.

3. **Vercel Environment Variable Scope**:
   - In Vercel, environment variables have distinct checkboxes: `Production`, `Preview`, and `Development`.
   - If `GEMINI_API_KEY` was saved without the **Production** checkbox checked, Vercel deployments do not receive the new key and continue running with the old build or previous environment state until redeployed.

---

### Step-by-Step Resolution Plan

#### 1. Configure the Dedicated Key in Vercel Dashboard
- Open **Vercel Dashboard** > select the **Apex Fit** project > **Settings** > **Environment Variables**.
- Verify that `GEMINI_API_KEY` is present.
- Ensure the **Production** environment checkbox is checked.
- Paste your dedicated key value and save.

#### 2. Configure Model Overrides (Recommended)
In Vercel **Environment Variables**, configure the following variables to avoid the strict 20 req/day limit of preview models:
- `GEMINI_MODEL`: `gemini-2.5-flash` (or `gemini-2.0-flash`)
- `GEMINI_FALLBACK_MODELS`: `gemini-2.5-flash,gemini-3.1-flash-lite`

*(The codebase in `server/app.ts` already reads `process.env.GEMINI_MODEL` and `process.env.GEMINI_FALLBACK_MODELS` dynamically).*

#### 3. Verify Google Cloud Project Quota for the Dedicated Key
- In [Google AI Studio](https://aistudio.google.com/) or [Google Cloud Console](https://console.cloud.google.com/):
  - Check the Project associated with your dedicated API key.
  - If on the free tier, note that preview versions like `gemini-3.8-flash` share a 20 req/day bucket. Standard models like `gemini-2.5-flash` provide 15 RPM / 1,500 RPD.
  - If billing is linked (Pay-As-You-Go), requests are unlimited up to your set spending limit, and the 20 req/day cap is completely removed.

#### 4. Trigger a Fresh Production Deployment in Vercel
- Changing environment variables in Vercel **does not take effect on an existing running deployment**.
- In Vercel: go to **Deployments** > click the `...` menu on the latest deployment > click **Redeploy** (ensure "Use existing Build Cache" is unchecked if you want a clean rebuild).

#### 5. Verify the Production AI Endpoints
- Test AI Chat (`/api/ai/chat`) and Food Estimation (`/api/ai/estimate-food`).
- Confirm HTTP 200 responses with the dedicated key active.
