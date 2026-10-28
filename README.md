# LetStyle (SkinTune) — AI-Powered Personal Color & Styling Platform

**LetStyle** is an AI-powered personal color analysis, outfit recommendation, and virtual styling platform built on **Next.js 15 (App Router)**, **React 19**, and **Tailwind CSS v4**.

It delivers a luxury digital styling experience: analyzing user skin tone and undertones, generating tailored seasonal color palettes, curating 5 distinct outfit looks with AI visual renderings, and providing dynamic multi-retailer shopping recommendations with strict audience and category validation.

---

## ✨ Key Features & Latest Updates

- **🎨 AI Personal Color & Undertone Analysis**
  - Interactive camera capture or photo upload with face positioning guidance and real-time validation.
  - Automatic diagnostics determining undertone (warm, cool, neutral), contrast levels, and best seasonal color palettes.
  - Mobile-optimized camera modal layout with selfie instructions and zero cutoff.

- **🧥 Dynamic Outfit Component Decomposition**
  - Decomposes generated outfit descriptions into every individual visible layer (e.g., blazers, jackets, shirts, trousers, footwear, accessories).
  - Guarantees that upper-body layers (such as blazers or overcoats) are never omitted from product search or recommendation cards.

- **🛍️ Intelligent Multi-Retailer Product Matching**
  - Live product discovery powered by Tavily search and curated retailer query synthesizers.
  - Generates direct retailer links for top fashion destinations (**Myntra, Ajio, Tata CLiQ, Amazon, Zara, H&M**).
  - Strict audience and category isolation (negative lookbehind patterns prevent cross-gender link leaks like men's footwear pointing to women's items or blazers matching shirts).

- **🔔 Audio & Visual Look Generation Notifications**
  - Elegant 3-tone luxury chime (E5 &rarr; A5 &rarr; E6) crafted with Web Audio API for zero-latency, cross-platform audio feedback.
  - Styled in-app toast notification upon completion of look visualization.
  - Optional desktop notifications for background tabs.

- **🎥 Editorial Video Showcases**
  - Widescreen hero video and vertical/horizontal model showcase reels (`model-video.mp4`, `model-video2.mp4`, `model-video3.mp4`, `makeup-video.mp4`).
  - Streamlined mobile-first responsive presentation.

- **🔐 Authentication, Credits & Dual-Database Support**
  - Secure cookie-based authentication with bcrypt password hashing.
  - Credit allowance system (initial free tier upon verified registration + per-action server-side deduction).
  - Zero-config dual database support: persistent local **SQLite** (`letstyle.db`) for development; **PostgreSQL** (Neon, Supabase, Vercel Postgres) for production.
  - Clean sign-out flow that resets personalization profiles and returns users to the initial welcome landing screen.

- **🛡️ Webpack & Fast Refresh Resilience**
  - Built-in early-capturing runtime error trap in `<head>` and enhanced error boundaries.
  - Intercepts and recovers from stale Webpack HMR chunk mismatches (`options.factory` / `Cannot read properties of undefined (reading 'call')`) during active development.

---

## 🏗️ Architecture & Folder Structure

```text
skintune-next/
├── public/                     # Static media, icons, and videos
│   ├── images/                 # Theme and lifestyle imagery
│   ├── makeup-video.mp4        # Beauty and makeup showcase video
│   ├── model-video.mp4         # Primary hero editorial video
│   ├── model-video2.mp4        # Model showcase clip 2
│   ├── model-video3.mp4        # Model showcase clip 3
│   └── favicon.svg             # LetStyle brand favicon
├── scripts/                    # Database migrations and regression test suites
│   ├── migrate.mjs             # Dual-engine DB schema migration (SQLite & Postgres)
│   └── test-product-matching.mjs # 21 comprehensive test scenarios
├── src/
│   ├── app/                    # Next.js 15 App Router
│   │   ├── api/                # Edge and Serverless API Route Handlers
│   │   │   ├── analyze-photo/  # Photo diagnostics & appearance analysis
│   │   │   ├── auth/           # Login, signup, logout, session check
│   │   │   ├── avatar/create/  # Personalized styling avatar generator
│   │   │   ├── credits/        # Balance inquiries & transaction logs
│   │   │   ├── generate-image/ # Look image generation with concurrency limits
│   │   │   ├── healthz/        # Health check endpoint
│   │   │   ├── product-recommendations/ # Dynamic product search
│   │   │   ├── products/       # User feedback on recommendations
│   │   │   ├── recommendations/# 5-look ensemble synthesis
│   │   │   ├── refine-image/   # Look image prompt adjustments
│   │   │   ├── search-dresses/ # Live dress research and refinement
│   │   │   └── try-on/         # Virtual Try-On (VTO) proxy
│   │   ├── error.tsx           # Global Next.js error boundary
│   │   ├── globals.css         # Luxury palette tokens & Tailwind CSS v4 styling
│   │   ├── layout.tsx          # Root layout with font optimization & early error trap
│   │   ├── not-found.tsx       # 404 page
│   │   ├── page.tsx            # Main application entry point
│   │   ├── providers.tsx       # React context providers & client error guards
│   │   └── LetStyleApp.tsx     # Master styling wizard & view coordinator
│   ├── components/             # Reusable global UI primitives
│   │   ├── common/             # Error boundaries, headers, navigation bars
│   │   └── ui/                 # Radix UI primitives (Accordion, Dialog, Tabs, Tooltip, etc.)
│   ├── features/               # Feature-based domain modules
│   │   ├── auth/               # Auth modal, context, sign-in/up forms
│   │   ├── landing/            # Hero, editorial showcases, benefits, video reels
│   │   ├── onboarding/         # Style preferences questionnaire & age selection
│   │   ├── photo-analysis/     # Camera capture, photo upload, face detection
│   │   ├── recommendations/    # Look cards, layer breakdown, visual canvas, audio chime
│   │   ├── settings/           # Saved outfits, profile preferences, credit balance
│   │   ├── shopping/           # Curated merchant links & retailer buttons
│   │   └── try-on/             # Virtual try-on interfaces
│   ├── lib/                    # Shared core utilities and server clients
│   │   ├── auth/               # Password hashing & session management
│   │   ├── db/                 # Database abstraction layer (SQLite / Postgres)
│   │   ├── notification.ts     # Web Audio API 3-tone chime & toast dispatcher
│   │   ├── openai-client.ts    # OpenAI API client
│   │   ├── product-search.ts   # Layer decomposition & product query synthesis
│   │   ├── retailer-urls.ts    # Merchant search URL builder & category/audience validator
│   │   ├── skintune-schemas.ts # Zod validation schemas
│   │   └── tavily-client.ts    # Tavily Live Search client
│   └── types/                  # TypeScript interfaces and domain types
├── .env.example                # Documented configuration template
├── next.config.ts              # Next.js configuration
├── package.json                # Project dependencies and script definitions
└── tsconfig.json               # TypeScript strict configuration
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js**: `>= 22.0.0`
- **npm** or **pnpm**

### 1. Installation

Clone the repository and install dependencies:

```bash
npm install
```

### 2. Environment Configuration

Copy the example environment file and configure your keys:

```bash
cp .env.example .env.local
```

Edit `.env.local` with your credentials:

```env
# Database (leave empty to use local SQLite: ./letstyle.db)
DATABASE_URL=

# AI & Live Search API Keys
OPENAI_API_KEY=sk-...
TAVILY_API_KEY=tvly-...

# Optional Provider Knobs
OPENAI_TEXT_MODEL=gpt-4o-mini
OPENAI_IMAGE_MODEL=gpt-image-2.5-flare
SEARCH_PROVIDER=tavily
VTO_PROVIDER=openai
```

### 3. Database Initialization

Run database migrations to initialize tables for users, sessions, and credits:

```bash
npm run db:migrate
```

*(If `DATABASE_URL` is omitted, LetStyle automatically creates and initializes `letstyle.db` locally).*

### 4. Running the Development Server

Start the local Next.js development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🧪 Testing & Validation

### Type Checking
Run the TypeScript compiler in non-emitting mode:

```bash
npm run typecheck
```

### Regression & Product Matching Tests
Run the 21 master verification scenarios covering product link category/audience consistency, layer decomposition, concurrency limits, auth flows, and image generation:

```bash
npm test
```

### Production Build
To create and verify an optimized production bundle:

```bash
npm run build
npm run start
```

---

## 🎨 Visual Identity & Theme Tokens

LetStyle utilizes a curated editorial color system designed for luxury fashion aesthetics:

| Token | Hex | Role |
| :--- | :--- | :--- |
| **TEAL** | `#194343` / `#194A49` | Primary luxury background, active accents, brand headers |
| **MOCHA** | `#663B1B` / `#B08A70` | Warm secondary surfaces, badges, card outlines |
| **LINEN / GOLD** | `#FAF5EE` / `#D7BD9B` | High-contrast typography, highlights, soft backgrounds |
| **SLATE / ACCENT**| `#2C2D30` | Neutral dark contrast text & borders |

- **Headings**: `Playfair Display` (editorial serif)
- **Body & Controls**: `DM Sans` / `Inter` (crisp sans-serif)

---

## 🔒 Security Best Practices

- All AI and search API keys (`OPENAI_API_KEY`, `TAVILY_API_KEY`, `FASHN_API_KEY`) are strictly server-side.
- Session tokens are stored in `HttpOnly`, `SameSite=Lax`, secure cookies.
- Password hashes use salt-backed bcrypt with dynamic salting.
- Zero client-exposed secrets (`NEXT_PUBLIC_` prefixes are prohibited for provider credentials).
