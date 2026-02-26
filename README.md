# AI Image Gallery

A personal image gallery that uses AI to automatically tag, describe, and enable semantic search across your uploaded photos. Upload images, get instant AI-generated tags and descriptions, then search by text, find visually similar images, or filter by dominant color.
Live demo: https://test-challenge-funnel.vercel.app

---

## Features

- **Email/password authentication** via Supabase Auth with protected routes
- **Drag and drop upload** — up to 10 JPEG/PNG images at once, 10MB each, with per-file progress
- **AI analysis** — GPT-4o-mini generates 5–10 hierarchical tags and a one-sentence description per image
- **Dominant color extraction** — top 3 colors extracted via quantization, no LLM cost
- **Text search** — searches both tags (array overlap) and descriptions (Postgres full-text) simultaneously
- **Similar image search** — TF-IDF cosine similarity with rare-tag boosting and color blending
- **Color filter** — click any dominant color swatch to find images with similar palette
- **Real-time processing updates** — gallery reflects AI status live via Supabase Realtime, no polling

---

## Architecture Overview

```
frontend/          React + TypeScript + Vite + Tailwind (shadcn/ui)
backend/           FastAPI (Python) — REST API + background processing pipeline
supabase/          PostgreSQL schema, RLS policies, Storage, Auth
modal_app.py       Optional Modal.com deployment wrapper for the FastAPI backend
```

**Request flow:**

1. The user uploads an image via the React frontend using `tus-js-client` (resumable uploads directly to Supabase Storage).
2. After upload, the frontend calls `POST /api/process-image` on the FastAPI backend.
3. The backend enqueues background processing (FastAPI `BackgroundTasks`) which:
   - Downloads the original from Supabase Storage
   - Generates a 300×300 JPEG thumbnail and re-uploads it
   - Calls OpenAI (`gpt-4o-mini`) with a signed URL to produce tags + description
   - Extracts the 3 dominant colors from the image bytes using Pillow
   - Persists all results to `image_metadata` with `ai_processing_status = completed`
4. The frontend recieves `image_metadata` via Supabase Realtime to update the gallery card as processing completes.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS, shadcn/ui, react-dropzone, tus-js-client |
| Backend | Python 3.12, FastAPI, Uvicorn, Pillow, OpenAI SDK |
| Database | Supabase (PostgreSQL) with Row Level Security |
| Storage | Supabase Storage (organized by `user_id/` folders) |
| Auth | Supabase Auth (email/password) |
| AI | OpenAI `gpt-4o-mini` (vision) |
| Deployment (optional) | Modal.com (serverless container for the FastAPI backend), Vercel for frontend |

---

## Prerequisites

- Python 3.12+
- Node.js 18+
- A [Supabase](https://supabase.com) project
- An [OpenAI](https://platform.openai.com) API key

---

## Setup Instructions

### 1. Supabase

1. Create a new Supabase project.
2. In the **SQL Editor**, run the migration files in order:
   ```
   supabase/migrations/20260225132536_remote_schema.sql
   supabase/migrations/20260225134140_remote_schema.sql
   ```
   This creates the `images` and `image_metadata` tables, enables RLS, and sets up the policies.
3. In **Storage**, create a bucket. Set it to **private**.
4. Note your project's **URL** and **service role secret key** from *Project Settings → API*.

For local setup refer to: https://supabase.com/docs/guides/local-development

### 2. Backend

```bash
cd backend
cp .env.example .env
```

Edit `.env` and fill in:

```env
SUPABASE_URL=https://<your-project-ref>.supabase.co
SUPABASE_SECRET_KEY=<service-role-secret-key>
SUPABASE_STORAGE_BUCKET=gallery

OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini

CORS_ORIGINS=http://localhost:5173
```

Install dependencies and run:

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload
```

The API will be available at `http://localhost:8000`. You can verify it with:

```bash
curl http://localhost:8000/health
# {"status":"ok"}
```

### 3. Frontend

```bash
cd frontend
cp .env.example .env        # create if it doesn't exist
```

Create `frontend/.env` with:

```env
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<your-anon-public-key>
SUPABASE_STORAGE_BUCKET=<your-supabase-storage-bucket-name>
VITE_API_BASE_URL=http://localhost:8000
```

Install and run:

```bash
npm install
npm run dev
```

The app will open at `http://localhost:5173`.

---

## API Keys Needed

| Key | Where to get it | Used by |
|-----|----------------|---------|
| `SUPABASE_URL` | Supabase → Project Settings → API | Backend |
| `SUPABASE_SECRET_KEY` | Supabase → Project Settings → API → service_role | Backend |
| `VITE_SUPABASE_URL` | Same as above | Frontend |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase → Project Settings → API → publishable key | Frontend |
| `OPENAI_API_KEY` | [platform.openai.com](https://platform.openai.com/api-keys) | Backend |

---

## Deployment (Optional — Modal.com)

The backend can be deployed serverlessly on [Modal](https://modal.com) using `modal_app.py`.

1. Install Modal: `pip install modal`
2. Authenticate: `modal setup`
3. Create a Modal Secret with the same environment variables as your `.env` file. Name it whatever you put in `MODAL_SECRET_NAME`.
4. Set `MODAL_APP_NAME`, `MODAL_API_LABEL`, and `MODAL_SECRET_NAME` in your `.env`.
5. Deploy:
   ```bash
   modal deploy modal_app.py
   ```
6. Update `VITE_API_BASE_URL` in the frontend to point to your Modal endpoint URL.

---

## Architecture Decisions

### AI Service — GPT-4o-mini

Image analysis uses GPT-4o-mini via the OpenAI Vision API. The prompt is tuned to return a strict JSON schema with 5–10 hierarchical tags (both specific and general, e.g. both `"golden retriever"` and `"dog"`) and a single-sentence description. Temperature is set to 0.2 for more deterministic output.

Color extraction is handled separately by Pillow's k-means quantization — this avoids LLM cost for a task that doesn't benefit from language understanding. The top 3 dominant colors are stored as hex strings.

See [AI_COMPARISON.md](./AI_COMPARISON.md) for the full service comparison.

### Image Upload: Direct-to-Storage via TUS

Images are uploaded directly from the browser to Supabase Storage using the TUS resumable upload protocol (`tus-js-client`), bypassing the FastAPI backend entirely for the upload step. This keeps the backend lightweight, avoids memory pressure on the API server for large files, and makes uploads resumable if the connection drops. The backend is only involved in post-upload processing.

### Background Processing with FastAPI BackgroundTasks

Rather than blocking the upload response while AI analysis runs, the backend immediately returns a `202 Accepted`-style response and runs processing in the background using FastAPI's built-in `BackgroundTasks`. This keeps the UI snappy — the gallery card appears instantly with a loading spinner, and updates live as AI results come in via Supabase Realtime.

### Similarity Search: TF-IDF Cosine + Color Distance (In-Memory)

Similar image search uses TF-IDF cosine similarity over AI-generated tags rather than vector embeddings or a dedicated vector database. This was chosen because it demonstrates the underlying similarity math directly, requires no additional infrastructure, and is fully sufficient at personal gallery scale.

The implementation includes:

- **Smoothed IDF weighting** — tags that appear in few images get higher weight
- **Rare-tag boost** — shared tags appearing in ≤25% of the corpus contribute an additional score bonus, so niche shared tags (e.g. `"bioluminescence"`) outweigh common ones (e.g. `"outdoor"`)
- **Color similarity blending** — HSL-space nearest-neighbor color matching contributes 30% of the final score alongside 70% tag score
- **Request cancellation** — in-flight requests are tracked by ID and abandoned if superseded


### Auth: Supabase (JWT passed to backend)

The frontend retrieves a JWT from Supabase Auth and sends it in the `Authorization: Bearer` header with every backend request. The FastAPI backend validates the JWT against Supabase's public key to identify the user. Supabase RLS policies enforce data isolation at the database level as a second layer.

---

## Database Schema

```sql
CREATE TABLE images (
  id              SERIAL PRIMARY KEY,
  user_id         UUID REFERENCES auth.users(id),
  filename        VARCHAR(255),
  original_path   TEXT,
  thumbnail_path  TEXT,
  uploaded_at     TIMESTAMP DEFAULT NOW()
);

CREATE TABLE image_metadata (
  id                    SERIAL PRIMARY KEY,
  image_id              INTEGER REFERENCES images(id),
  user_id               UUID REFERENCES auth.users(id),
  description           TEXT,
  tags                  TEXT[],
  colors                VARCHAR(7)[],       -- hex codes, e.g. '#3a7bd5'
  ai_processing_status  VARCHAR(20) CHECK (ai_processing_status IN ('pending','processing','completed','failed')),
  error_message         TEXT,
  created_at            TIMESTAMP DEFAULT NOW()
);
```

Row Level Security ensures users can only read and write their own rows.

---

## Potential Improvements

- **No real task queue.** BackgroundTasks + `asyncio.to_thread` works well for the current scale; Celery/Redis would be the production upgrade for high-concurrency processing.
- **Vector embeddings for similarity** — use OpenAI `text-embedding-3-small` embeddings stored in `pgvector` for richer semantic similarity beyond tag overlap for a low cost.
- **Streaming upload progress** — expose a WebSocket or SSE endpoint to push per-image processing updates instead of relying on Supabase Realtime.
- **JPEG and PNG only.** WebP, HEIC, and other modern formats are not supported.
- **Batch AI processing** — use the OpenAI Batch API for cost savings when processing large numbers of images at once (50% cheaper, async delivery).
- **Rate limiting** — add per-user request rate limits on the backend to prevent abuse of the AI analysis endpoint.