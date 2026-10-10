# SkinTune — Unified Next.js Application

SkinTune is an AI-powered personal color analysis, outfit recommendation, and virtual styling platform migrated to **Next.js 15 (App Router)**.

This unified application consolidates the previous separate Vite frontend (`artifacts/skintune`) and Express 5 backend (`artifacts/api-server`) into a single unified full-stack application running on port **3000** with zero CORS, proxying, or dual-process overhead.

---

## 🏗️ Architecture & Folder Structure

The project strictly follows a **Feature-Based Modular Architecture**:

```text
artifacts/skintune-next/
├── public/                     # Static assets (images, icons, robots.txt)
├── src/
│   ├── app/                    # Next.js App Router (Layout, Page, API Routes)
│   │   ├── api/                # All 12 API Route Handlers (Serverless/Edge compatible)
│   │   │   ├── analyze-photo/
│   │   │   ├── avatar/create/
│   │   │   ├── generate-image/
│   │   │   ├── healthz/
│   │   │   ├── product-recommendations/
│   │   │   ├── products/feedback/
│   │   │   ├── recommendations/
│   │   │   ├── refine-image/
│   │   │   ├── search-dresses/
│   │   │   │   ├── refine/
│   │   │   │   └── research/
│   │   │   └── try-on/
│   │   ├── globals.css         # Luxury theme tokens (Teal, Mocha, Linen) & keyframe animations
│   │   ├── layout.tsx          # Root shell, font imports & providers
│   │   ├── page.tsx            # Main landing & client entrypoint
│   │   ├── providers.tsx       # Client providers (Tooltip, ErrorBoundary)
│   │   └── SkinTuneApp.tsx     # Wizard flow coordinator & screen manager
│   ├── components/             # Global reusable components
│   │   ├── common/             # Shell, Header, Intro, FooterActions, ErrorBoundary
│   │   └── ui/                 # Radix primitives (Button, Card, Dialog, Tabs, etc.)
│   ├── features/               # Domain-specific feature modules
│   │   ├── landing/            # Landing page sections, hero, navbar, and luxury showcase
│   │   ├── onboarding/         # Questionnaire steps, option cards, consent, and review
│   │   ├── photo-analysis/     # Camera capture, face diagnostics, undertone analysis
│   │   ├── recommendations/    # AI look generation, visual rendering, detail view, feedback
│   │   ├── shopping/           # Product discovery, merchant links & curation
│   │   ├── try-on/             # Virtual try-on (VTO) & avatar generation
│   │   └── settings/           # User saved looks & settings dashboard
│   ├── hooks/                  # Global React hooks (e.g. use-mobile)
│   ├── lib/                    # Shared libraries & utilities
│   │   ├── dress-search-server.ts # Server-side dress & product search engine
│   │   ├── logger.ts           # Structured logging
│   │   ├── openai-client.ts    # OpenAI SDK client
│   │   ├── product-search.ts   # Product search helpers
│   │   ├── skintune-schemas.ts # Zod validation schemas
│   │   ├── tavily-client.ts    # Tavily Web search client
│   │   └── utils.ts            # Class merging & utility functions
│   └── types/                  # TypeScript domain interfaces
├── .env.example
├── .env.local                  # Environment secrets (OPENAI_API_KEY, TAVILY_API_KEY)
├── next.config.ts
├── package.json
└── tsconfig.json
```

---

## 🚀 Running the Application

### 1. Development Server
To run SkinTune in development mode with hot-reloading:

```powershell
pnpm --filter @workspace/skintune-next run dev
```

The app will start at **http://localhost:3000**.

### 2. Type Checking
To run TypeScript compiler verification without emitting files:

```powershell
pnpm --filter @workspace/skintune-next run typecheck
```

### 3. Production Build
To create an optimized production build:

```powershell
pnpm --filter @workspace/skintune-next run build
```

And to start the production server:

```powershell
pnpm --filter @workspace/skintune-next run start
```

---

## 🔑 Environment Variables

Create or edit `.env.local` inside `artifacts/skintune-next/`:

```env
OPENAI_API_KEY=sk-...
TAVILY_API_KEY=tvly-...
```

---

## 🎨 Visual Identity & Theme Tokens

- **TEAL (`#194343`)**: Main luxury page background, navbar, primary cards.
- **MOCHA (`#663B1B`)**: Warm secondary surfaces, buttons, borders.
- **LINEN (`#D7BD9B`)**: High-contrast crisp typography, accents, and highlights.
- **Typography**: `DM Sans` (body text) and `Playfair Display` (editorial serif headings).
