# TestiQo - Conversational AI Agent

A **RAG (Retrieval-Augmented Generation)** conversational AI assistant for TestiQo. It answers questions from a PDF knowledge base using semantic search (Pinecone) and OpenAI, with **role-based filtering**, **section-aware chunking**, and **automatic image rendering** in responses.

---

## Table of Contents

- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Database & Vector Store](#-database--vector-store)
- [Chunking Strategy](#-chunking-strategy)
- [API Keys & Models](#-api-keys--models)
- [How Data Is Stored (Pinecone)](#-how-data-is-stored-pinecone)
- [How the Chat Fetches & Responds](#-how-the-chat-fetches--responds)
- [Project Structure](#-project-structure)
- [Setup](#-setup)
- [Scripts](#-scripts)
- [License](#-license)

---

## Features

- **Section-header chunking** – Splits the PDF by logical section headers (e.g. "Admin Registration", "Login to TestiQo") so instructions are not cut mid-flow.
- **Role-based filtering** – Chunks are tagged with `role` (admin, editor, candidate, general). The chat API only retrieves content for the user’s selected role plus `general`.
- **Image association** – S3 image links from the PDF are stored in chunk metadata; the LLM is instructed to render them in markdown when relevant.
- **3072-dimension embeddings** – Uses `text-embedding-3-large` for semantic search.
- **REST over HTTPS** – OpenAI and Pinecone are called via raw `https` in the chat API (no heavy SDK in the request path) for simple deployment (e.g. Windows).

---

## Tech Stack

| Layer        | Technology |
|-------------|------------|
| **Framework** | Next.js 14 (App Router, TypeScript) |
| **Vector DB** | **Pinecone** (serverless or standard index) |
| **LLM**       | OpenAI **gpt-4o-mini** (chat) |
| **Embeddings**| OpenAI **text-embedding-3-large** (3072 dimensions) |
| **PDF parsing** | `pdf-parse` (Node.js) |
| **UI**        | Tailwind CSS, Framer Motion, react-markdown, remark-gfm |

---

## Database & Vector Store

- **Database used:** **Pinecone** only. There is no relational database (no PostgreSQL, MySQL, etc.).
- **Pinecone** is used as the **vector store** for RAG: it stores embeddings and metadata for each chunk; the chat API queries it by vector similarity and filters by `role`.
- **Index requirements:**
  - **Dimensions:** `3072` (must match `text-embedding-3-large`).
  - Create the index in the [Pinecone Console](https://app.pinecone.io); the app only needs the index name and API key.

---

## Chunking Strategy

Chunking is implemented in two places that stay in sync:

1. **`src/lib/chunking-service.ts`** – TypeScript interface and logic (used if you build tooling on top of the app).
2. **`scripts/index-kb.js`** – The script that actually reads the PDF and upserts to Pinecone (same logic, in Node).

### Step 1: Section split (structural)

- The full PDF text is split by **section headers** using a regex so that each section starts at a known heading:
  - Headers used: `Admin Registration`, `Login to TestiQo`, `Team Management & User Roles`, `Getting Started`, `Introduction to TestiQo`.
- Regex:  
  `/\n(?=Admin Registration|Login to TestiQo|Team Management & User Roles|Getting Started|Introduction to TestiQo)/`
- This avoids splitting in the middle of a section and keeps logical blocks together.

### Step 2: Role tagging (per section)

- The **first line** of each section is treated as the section title.
- Role is derived from that title:
  - **admin** – section title contains "Admin" or "Team Management"
  - **editor** – section title contains "Editor"
  - **candidate** – section title contains "Candidate" or "Viewer"
  - **general** – section title contains "registration", "login", or anything else (shared content for all roles)

### Step 3: Sub-split by “Step N:”

- Within each section, text is split again by **step boundaries**:  
  `/\n(?=Step \d:)/`
- This keeps each “Step 1”, “Step 2”, … block as one chunk so that instructions stay coherent.

### Step 4: Image extraction

- In each section, S3 image links are detected with:  
  `Image Link:\s*(https:\/\/ai-saturday\.s3[^\s]+)`
- For each chunk (piece), the code associates the **first image URL** that appears in or near that piece (or falls back to the first image in the section).
- The raw “Image Link: …” line is stripped from the stored text; the URL is kept only in metadata.

### Step 5: Chunk output

- Each chunk has:
  - **text** – cleaned content (no “Image Link: …” line).
  - **metadata** – `role`, `section` (section title), `imageUrl` (optional).
- Chunks shorter than 10 characters are dropped.

**Summary:** Section-level split → role from section title → step-level split → image association → one chunk per step (or equivalent block) with `role`, `section`, and optional `imageUrl`.

---

## API Keys & Models

### Environment variables

All secrets and config come from **`.env.local`** (Next.js and the indexing script both use it).

| Variable | Required | Used by | Purpose |
|----------|----------|---------|--------|
| `OPENAI_API_KEY` | Yes | Chat API, index script | Auth for OpenAI (embeddings + chat). |
| `PINECONE_API_KEY` | Yes | Chat API, index script, `src/lib/pinecone.ts` | Auth for Pinecone. |
| `PINECONE_INDEX_NAME` | Yes | Chat API, index script, `src/lib/pinecone.ts` | Name of the Pinecone index (3072 dimensions). |

- **Chat API** (`src/app/api/chat/route.ts`): reads `process.env.OPENAI_API_KEY`, `PINECONE_API_KEY`, `PINECONE_INDEX_NAME` at request time.
- **Index script** (`scripts/index-kb.js`): loads `.env.local` manually (for running outside Next.js, e.g. `node scripts/index-kb.js`) and uses the same three variables.
- **Pinecone client** (`src/lib/pinecone.ts`): uses `PINECONE_API_KEY` and `PINECONE_INDEX_NAME`; throws if they are missing.

### Models

| Use | Model | Where configured |
|-----|--------|-------------------|
| Embeddings | **text-embedding-3-large** (3072 dims) | `route.ts` (`getEmbedding`), `index-kb.js` (`getEmbedding`) |
| Chat | **gpt-4o-mini** | `route.ts` (fetch to `v1/chat/completions`) |

There is no config file for model names; they are hardcoded in the chat route and the index script. To switch models, change those two places (and ensure the Pinecone index dimension matches the embedding model).

---

## How Data Is Stored (Pinecone)

The **index script** (`scripts/index-kb.js`) is responsible for storing data; the app does not write to Pinecone at runtime.

### Upsert payload (per vector)

- **id:** `chunk-{timestamp}-{counter}` (unique per chunk).
- **values:** embedding from `text-embedding-3-large` for the chunk’s **cleaned text** (newlines replaced with space before sending to OpenAI).
- **metadata** (stored in Pinecone):
  - `text` – cleaned chunk text.
  - `parentContext` – full section text (with image links stripped), for richer context in the chat.
  - `role` – `"admin" | "editor" | "candidate" | "general"`.
  - `section` – section title (first line of section).
  - `imageUrl` – optional S3 image URL for this chunk.

### Index requirements

- **Dimensions:** 3072.
- **Metric:** Default (usually cosine) is fine; the app does not specify a metric in the code.

---

## How the Chat Fetches & Responds

Flow: **user message → embed → Pinecone query (with role filter) → build context → system prompt → OpenAI chat (streaming)**.

1. **Request**  
   - `POST /api/chat` with body: `{ messages, role }`.  
   - `role` is one of: `admin`, `editor`, `candidate` (from the UI).  
   - Only the **last** user message is used for retrieval.

2. **Embedding**  
   - Last user message is sent to OpenAI `v1/embeddings` with `text-embedding-3-large`.  
   - Newlines in the message are replaced with spaces.

3. **Pinecone host**  
   - The route calls Pinecone’s index API:  
     `GET https://api.pinecone.io/indexes/{PINECONE_INDEX_NAME}`  
   - Uses `PINECONE_API_KEY` and reads `host` from the response for the actual query.

4. **Pinecone query**  
   - `POST https://{host}/query` with:
     - `vector`: embedding from step 2.
     - `topK`: 5.
     - `includeMetadata`: true.
     - `filter`: `role` in `[selectedRole, "general"]` so the user only sees content for their role plus shared content.

5. **Context building**  
   - From each match: `section`, `parentContext` or `text`, `imageUrl`.  
   - Deduplicated by a key like `section + content + imageUrl`.  
   - Each block is formatted as `[Source: {section}]\n{content}` and, if present,  
     `\n(MANDATORY IMAGE TO SHOW: {imageUrl})`.  
   - Blocks are joined with `\n\n---\n\n`.

6. **System prompt**  
   - The context is placed between `KNOWLEDGE_BASE_START` and `KNOWLEDGE_BASE_END`.  
   - Instructions: answer only from that block, respect role, render mandatory images in markdown, no hallucination, basic prompt-injection rules.

7. **Chat completion**  
   - `POST https://api.openai.com/v1/chat/completions` with:
     - `model: "gpt-4o-mini"`.
     - `messages`: system (with context) + conversation history.
     - `stream: true`.  
   - Response body is forwarded as `text/event-stream` to the client.

8. **Validation**  
   - If the last user message length > 3000 characters, the API returns 400 and does not call OpenAI or Pinecone.

The **frontend** (`ChatInterface`) calls `POST /api/chat` with the current `messages` and `role`, then consumes the stream and updates the assistant message in real time. Markdown (including images) is rendered with `react-markdown` and `remark-gfm`.

---

## Project Structure

Tracked files (build artifacts, `node_modules`, and env files are gitignored):

```
testiqo/
├── src/
│   ├── app/
│   │   ├── api/chat/route.ts    # RAG chat API (embed → Pinecone → OpenAI stream)
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx             # Role picker + ChatInterface
│   ├── components/
│   │   └── ChatInterface.tsx    # Chat UI, markdown, streaming
│   └── lib/
│       ├── chunking-service.ts  # PDF chunking + role/image metadata
│       └── pinecone.ts          # Pinecone client
├── scripts/
│   └── index-kb.js              # Index PDF → Pinecone (run once)
├── .env.local                   # Secrets (not committed)
├── .gitignore
├── next.config.mjs
├── package.json
├── postcss.config.js
├── tailwind.config.ts
├── tsconfig.json
└── README.md
```

| Path | Purpose |
|------|--------|
| **`src/app/api/chat/route.ts`** | RAG chat endpoint: embed query → query Pinecone (role filter) → build context → OpenAI streaming chat. |
| **`src/app/page.tsx`** | Home: role selection (admin / editor / candidate), then renders `ChatInterface`. |
| **`src/app/layout.tsx`** | Root layout and global styles. |
| **`src/components/ChatInterface.tsx`** | Chat UI: messages, input, streamed responses, markdown + images. |
| **`src/lib/chunking-service.ts`** | Chunking logic: PDF → sections → role tagging → step split → image association. |
| **`src/lib/pinecone.ts`** | Pinecone client (`PINECONE_API_KEY`, `PINECONE_INDEX_NAME`). |
| **`scripts/index-kb.js`** | Index script: `.env.local` + PDF → chunk → embed → upsert to Pinecone. |

---

## Setup

### 1. Prerequisites

- **Node.js** (LTS recommended).
- **OpenAI API key** (for embeddings and gpt-4o-mini).
- **Pinecone account**: create an index with **3072 dimensions** and note the index name.

### 2. Environment

Create **`.env.local`** in the project root:

```bash
OPENAI_API_KEY=your_openai_key
PINECONE_API_KEY=your_pinecone_key
PINECONE_INDEX_NAME=your_index_name
```

Do not commit this file.

### 3. Install dependencies

```bash
npm install
```

### 4. Index the knowledge base

Place your PDF as **`TestiQo Knowledge Base.pdf`** in the project root (or adjust the path in `scripts/index-kb.js`). Then run:

```bash
node scripts/index-kb.js
```

This parses the PDF, chunks it (section → role → step, with images), generates embeddings, and upserts to Pinecone. The script loads `.env.local` itself so it can be run without starting Next.js.

### 5. Run the app

```bash
npm run dev
```

Open the app, choose a role (admin / editor / candidate), and use the chat. The first request will use the indexed data for that role.

---

## Scripts

| Command | Description |
|--------|-------------|
| `npm run dev` | Start Next.js dev server. |
| `npm run build` | Production build. |
| `npm run start` | Run production server. |
| `npm run lint` | Run ESLint. |
| `node scripts/index-kb.js` | Index `TestiQo Knowledge Base.pdf` into Pinecone (requires `.env.local` and the PDF in project root). |

---

## License

This project is private and intended for TestiQo internal use.
