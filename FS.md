# Cooking GPS — Functional Specification

> A complete, build-from-scratch specification for an interactive, loop-based cooking-video platform. This document describes **what** the product does and **how it should behave**, not the existing code. A developer should be able to build the product from this spec alone.

---

## 1. Product Overview

**Cooking GPS** turns ordinary cooking videos into interactive, step-by-step "navigable" tutorials — like GPS turn-by-turn directions for cooking. Instead of scrubbing back and forth through a long video while your hands are busy, a recipe is broken into discrete **steps**, each mapped to a segment of the video. The player can **loop** a step until you're ready, **wait** (pause) at the end of a step, or play **continuously**. The whole experience is hands-free capable via **voice commands**.

The product has three surfaces:

1. **Mobile web app** — phone-first cooking companion (the primary "in the kitchen" experience).
2. **Desktop web app** — a richer authoring + playback workbench (larger screen, multi-step views, advanced editor).
3. **API server** — shared backend (accounts, recipes, social, AI video analysis, file storage).

Both clients share one backend, one data model, and one account system.

### Target users
- **Cooks/followers** — find recipes, save them, cook along hands-free.
- **Creators** — turn their own videos (uploaded or linked) into navigable recipes and publish/share them.

### Core value proposition
- Precise, repeatable control over *which part* of a video plays and *how* it repeats.
- Hands-free operation while cooking.
- AI assistance to convert a raw video into structured steps automatically.

---

## 2. Core Concepts & Domain Model

These concepts are the heart of the product. Get these right first.

### 2.1 Recipe
A recipe maps a single video to an ordered set of steps.

- **Video source**: either an uploaded video file *or* a linked URL (YouTube/Vimeo/TikTok/Instagram). A recipe references exactly one video.
- **Duration**: total length of the video in seconds.
- **Loops**: an ordered array of timestamps (in seconds) that define **step boundaries**. With N loop markers you get the segment boundaries that divide the video into steps. (e.g., `loops = [0, 30, 75, 120]` → step 1 is 0–30s, step 2 is 30–75s, etc.)
- **Steps**: an ordered array, one entry per segment. Each step has:
  - `title` (short name, e.g., "Sear the chicken")
  - `instruction` (detailed text, optional)
  - `notes` (optional)
  - `subLoops` (optional array of timestamps **within** the step that further subdivide it — see 2.3)
- **Pages** (optional): extra free-form content sections attached to a recipe (`title` + `content`), e.g., an ingredients page or notes page.
- **Cover/thumbnail**: either a captured video frame, an uploaded image, or a generated gradient fallback.
- **Attribution**: a recipe may be a **remix** of another recipe (see 2.5).
- **Visibility**: `isPrivate` and `isPublished` flags control who can see it (see 2.4).

### 2.2 Playback modes
The defining feature. Every recipe is played in one of three modes, switchable live:

1. **Loop** (default): repeats the current step (or sub-loop) endlessly. When playback reaches the step's end boundary it jumps back to the step's start. The cook watches the same technique repeat until they advance.
2. **Wait**: plays the current step once, then **pauses** exactly at the end boundary and queues the next step. Pressing play / saying "next" advances into the next step.
3. **Continuous**: plays straight through like a normal video; the UI highlights whichever step corresponds to the current playback time.

> **Critical behavior**: In Loop and Wait modes, the player must NOT auto-advance the highlighted step based purely on playback time crossing a boundary. The boundary is a hard stop / loop-back point. (A naive "current time ≥ next boundary → advance" implementation breaks loop-back at stops; the step only changes when the user navigates.)

### 2.3 Sub-loops
Within a single step, a creator can define **sub-loops** — finer-grained checkpoints. When a step has sub-loops, the player can loop/wait on a sub-segment instead of the whole step, and the user can jump between sub-loops via step chips or voice. Sub-loop timestamps are nudgeable one second at a time in the editor.

### 2.4 Visibility & sharing rules
Two independent flags:
- **`isPrivate`** — if true, the recipe is owner-only by default.
- **`isPublished`** — if true, the recipe is eligible to appear in public discovery/feeds.

Resolved access rules (`canViewRecipe`):
- A **published, non-private** recipe is visible to everyone (and appears in Discover/feeds).
- A **private original** recipe is visible only to its owner.
- A **remix** (a recipe with an attribution link to an original) is treated as **"public via link"**: it stays out of global discovery (`isPrivate: true`) but **anyone who has the direct link/ID can view it**. This enables sharing a personal version by link without cluttering public discovery.
- Only **published, non-private** recipes may be pinned to a user's **public profile board**.

### 2.5 Remix / "Save my version"
When viewing **someone else's** recipe, a user can make their own editable copy:
- The button reads **"Remix"** / **"Make my own version"**. Clicking it opens the original in the editor in a "save my version" state.
- **A copy is created only when the user actually saves** (not on click). This prevents orphan/empty copies. The "Save my version" action creates a new recipe owned by the current user, with an attribution link back to the original.
- The remix copies the original's steps, loops, sub-loops, and video reference.

### 2.6 Folders & saved recipes
- Users save recipes into a personal **library**.
- The library is a **nested folder system** (folders can contain subfolders). Each folder has a name, an owner, and an optional parent.
- A saved recipe links a user to a recipe, optionally filed under a folder. "All recipes" is the unfiled/aggregate view.

### 2.7 Widgets (customizable boards)
Both the **Home ("My Page")** and the **public Profile** are bento-style, drag-and-drop grids of **widgets**:
- Widget `kind` is either **recipe** (shortcut to one recipe) or **folder** (a browsable collection).
- Each widget belongs to a `board` (`home` or `profile`), and stores grid position (`x`, `y`), size (`width`, `height`), and an ordering `position`.
- Sizes are selectable (e.g., 1×1, 2×1, 1×2, 2×2; desktop also supports larger). A **folder** widget at full width becomes a horizontal **carousel** for browsing recipes inline.
- A "Match Sizes" tool snaps all tiles on a board to one uniform size.

### 2.8 Social
- **Follow/unfollow** other users; both users' follower/following counts update.
- **Comments** on a recipe; a comment may be pinned to a specific **step index**.
- Per-user public profile with display name, bio, avatar, and stats (followers, following, recipe count).

---

## 3. Data Model (Persistence)

PostgreSQL (or equivalent relational store). All IDs are server-generated integers unless noted. Timestamps default to creation time.

### users
| field | type | notes |
|---|---|---|
| id | int (PK) | |
| authUserId | text (unique, nullable) | external identity-provider user id |
| username | text (unique, required) | auto-generated if not supplied |
| displayName | text (nullable) | |
| bio | text (nullable) | |
| avatarUrl | text (nullable) | |
| followerCount | int, default 0 | denormalized counter |
| followingCount | int, default 0 | denormalized counter |
| recipeCount | int, default 0 | denormalized counter |
| uiPreferences | json, default {} | e.g., `{ sidebarCollapsed?: bool }`; should also hold theme/UI prefs |
| createdAt | timestamp | |

### follows
| field | type | notes |
|---|---|---|
| id | int (PK) | |
| followerId | int → users.id (cascade) | |
| followingId | int → users.id (cascade) | |
| createdAt | timestamp | |

### recipes
| field | type | notes |
|---|---|---|
| id | int (PK) | |
| title | text, required | |
| creatorId | int → users.id (cascade) | owner |
| remixOfId | int → recipes.id (nullable, set null on delete) | attribution to original |
| duration | float, default 0 | seconds |
| loops | json `number[]`, default [] | step boundary timestamps |
| steps | json array, default [] | each: `{ title, instruction?, notes?, subLoops?: number[] }` |
| pages | json array, default [] | each: `{ title, content }` |
| isPrivate | bool, default true | |
| isPublished | bool, default false | |
| videoUrl | text (nullable) | uploaded/served video path |
| sourceUrl | text (nullable) | original external URL if linked |
| sourcePlatform | text (nullable) | e.g., youtube/vimeo/tiktok/instagram |
| thumbnailGradient | text (nullable) | fallback gradient identifier |
| thumbnailUrl | text (nullable) | cover image |
| savedCount | int, default 0 | denormalized |
| commentCount | int, default 0 | denormalized |
| createdAt | timestamp | |

### saved_recipes
| field | type | notes |
|---|---|---|
| id | int (PK) | |
| userId | int → users.id (cascade) | |
| recipeId | int → recipes.id (cascade) | |
| folderId | int (nullable) | optional folder |
| createdAt | timestamp | |

### folders
| field | type | notes |
|---|---|---|
| id | int (PK) | |
| name | text, required | |
| userId | int → users.id (cascade) | |
| parentId | int (nullable) | nesting |
| createdAt | timestamp | |

### comments
| field | type | notes |
|---|---|---|
| id | int (PK) | |
| recipeId | int → recipes.id (cascade) | |
| authorId | int → users.id (cascade) | |
| body | text, required | |
| stepIdx | int (nullable) | pin comment to a step |
| createdAt | timestamp | |

### user_widgets
| field | type | notes |
|---|---|---|
| id | int (PK) | |
| userId | int → users.id (cascade) | |
| kind | enum: recipe \| folder | |
| refId | int | recipe id or folder id |
| board | enum: home \| profile, default home | |
| position | int, default 0 | ordering |
| posX | int, default 0 | grid x |
| posY | int, default 0 | grid y |
| width | int, default 1 | grid cells |
| height | int, default 1 | grid cells |
| createdAt | timestamp | |

> Denormalized counters (`followerCount`, `followingCount`, `recipeCount`, `savedCount`, `commentCount`) must be kept in sync transactionally on the relevant create/delete operations.

---

## 4. Authentication

- Use a hosted identity provider (email + social login) for sign-in/sign-up. The reference build uses **Clerk**, but any equivalent OIDC provider works.
- On every authenticated request, **provision a local user**: if no local `users` row exists for the authenticated identity, create one (generating a unique username). This keeps the local profile in sync with the identity provider.
- Two middleware modes:
  - **requireAuth** — reject if not signed in; guarantee a local user row exists.
  - **optionalAuth** — resolve the user if signed in, but allow anonymous access (needed for viewing public/shared recipes signed-out).
- Signed-out visitors must be able to open shared recipe links (public + remix-via-link recipes) without an account.

---

## 5. API Specification

REST over JSON, all under `/api`. Auth via the identity provider's session/token. Below, "current user" = the authenticated local user.

### Recipes & feed
- `GET /recipes` — list public, published recipes (discovery).
- `GET /recipes/feed` — personalized "For You" feed (chronological public recipes is an acceptable v1).
- `GET /recipes/my-kitchen` — current user's own recipes (private + personal).
- `GET /recipes/:id` — recipe detail; enforces `canViewRecipe` (owner, or published-public, or remix-via-link). Returns 404/403 otherwise.
- `POST /recipes` — create a recipe.
- `PATCH /recipes/:id` — update title, steps, loops, sub-loops, pages, privacy, cover (owner only).
- `PATCH /recipes/:id/publish` — toggle published/public visibility (owner only).
- `POST /recipes/:id/remix` — create a private, editable copy owned by current user, with attribution to the original. (Per the "save on save" rule, the client may defer calling this until the user saves their version.)
- `POST /recipes/:id/save` — save a recipe into the current user's library (optional `folderId`); increments `savedCount`.

### AI & video analysis
- **Upload**: video files uploaded (multipart) to server storage; served statically (e.g., `/uploads/...`). `videoUrl` points at the served file.
- `POST /recipes/analyze-video` — extract audio from an uploaded video, send to a multimodal LLM (reference uses Gemini 2.5 Flash) to detect natural loop boundaries (timestamps), step instructions, and ingredient lists.
- `POST /recipes/analyze-social` — download a public TikTok/Instagram reel (reference uses `yt-dlp`), then run the same audio→analysis pipeline.
- `POST /recipes/analyze-youtube` — analyze a YouTube video using its transcript/captions; if none available, fall back to multimodal video ingestion.
- All analysis endpoints support three **modes**:
  - **full / "everything"** — place loop boundaries AND write steps + ingredients.
  - **loops / "loop stops only"** — return boundary timestamps only.
  - **describe / "describe my loops"** — given user-supplied boundaries, generate text descriptions for each.

### Folders & saved items
- `GET /folders` — list top-level folders for current user.
- `GET /folders/:id` — folder contents (subfolders + joined recipe details).
- `POST /folders` — create a folder (optional `parentId` for nesting).
- (Plus rename/delete folder operations and remove-saved-recipe as needed for library management.)

### Widgets & boards
- `GET /users/me/widgets?board=home|profile` — list widgets for a board.
- `PATCH /users/me/widgets/layout` — bulk update positions/sizes (`x, y, width, height`) for a board.
- `PATCH /users/me/widgets/reorder` — update sequential `position` ordering.
- (Plus add/remove widget operations.)

### Users & social
- `GET /users/me` — current profile.
- `PATCH /users/me` — update display name, bio, avatar.
- `GET /users/me/preferences` / `PATCH` — UI state (sidebar, theme, etc.) stored in `uiPreferences`.
- `PATCH /users/:id/follow` — toggle follow; update both users' counters.
- `GET /users/:username` (public profile) + that user's public/profile-board recipes.

### Comments
- `GET /recipes/:id/comments` — list (optionally filtered by step).
- `POST /recipes/:id/comments` — add a comment (optional `stepIdx`); increments `commentCount`.

---

## 6. Mobile Web App (phone-first)

Bottom tab navigation with five destinations: **My Page**, **Discover**, **Create** (center primary action), **Library**, **Profile**.

### 6.1 My Page (Home)
- Personalized, widget-based dashboard (recipe widgets + folder widgets).
- **Edit mode**: drag-and-drop to reorder, resize widgets (1×1, 2×1, 1×2, 2×2), remove widgets, add widgets, and a "Match Sizes" bulk action.
- Folder widgets render as scrollable carousels.

### 6.2 Discover
- Search-first feed of public recipes: search bar (recipes + creators), trending tags, and a grid of recipe cards.
- Recipe cards show thumbnail (gradient fallback), preview-on-focus, and a quick-save action.
- Save directly to a folder via a reusable folder-picker bottom sheet.

### 6.3 Library
- User folders + saved recipes; create folders; open folder contents; manage the "All Recipes" list.

### 6.4 Create / Editor
- Upload a local video or paste a YouTube/Vimeo/social link.
- Timeline-based loop-marker placement: add a marker at the current playhead; drag markers to retime.
- Per-step instruction editor.
- Capture a video frame as the cover, or upload a custom cover.
- Toggle privacy / publish.
- AI generation (everything / loop stops only / describe my loops).

### 6.5 Recipe Player ("the GPS")
- Video area on top, interactive **step strip** at the bottom.
- Mode switch: **Loop / Wait / Continuous**.
- Sub-loop navigation; step navigation by swipe, buttons, or tapping step chips (chips **seek the video**).
- Panel toggle: **Steps** (instructions) vs **Comments**.
- Remix to make a personal version; follow creator; post step-pinned comments.
- Works for both uploaded video (HTML5) and embedded YouTube/Vimeo, with loop/wait behavior simulated on embeds.

### 6.6 Profile & Settings
- Display name, bio, kitchen stats; dark mode toggle; account management.

### 6.7 Global voice navigation
- Always-available voice control: "Go to Discover", "Open my profile", "Go home", etc. (full vocabulary in §8).

---

## 7. Desktop Web App (authoring + playback workbench)

Richer, larger-screen experience. Routing is client-side. Same backend and data model.

### 7.1 Video player / playback engine
- Same three modes (Loop / Wait / Continuous) with the same boundary semantics as mobile.
- **Sub-loops & nudging**: jump between sub-loops via step chips; nudge boundaries one second at a time.
- **Seeking**: progress timeline, Next/Prev step buttons, and clickable step chips. A configurable **Seek Step** (1 / 2 / 5 / 10 / 30 seconds) drives keyboard-arrow and on-screen nudge controls. For uploaded video, prev/next chevrons + keyboard arrows seek by the seek step; linked sources step-jump between boundaries.
- **Playback speed**: 0.25× to 4×.
- **Workshop mode (multi-step)**: select multiple steps and view them simultaneously in a grid / row / stack layout. Supports **Synced playback** (all clips loop together on a master clock = the longest clip) and **Independent playback** (each loops on its own).

### 7.2 Recipe editor (split-workbench)
- Mark "Loop Stops" on the video timeline; each stop creates a step boundary.
- Each step: title, instructions, and its own sub-loops.
- View modes: **List**, **Board** (side-by-side tiles), **Stack** (vertical feed).
- AI "Generate with AI" menu (everything / loop stops only / describe my loops).
- Thumbnail/cover tool: capture current frame or upload custom.
- **Undo/redo** with full history (Cmd+Z / Cmd+Shift+Z).

### 7.3 My Page & Profile boards
- Draggable, resizable widget grid (recipes + folders). Drag to move, drag corners to resize, "Match Sizes" tool.
- Full-width folder widgets become horizontal carousels.
- Public profile board filters to published, non-private content only.

### 7.4 Library
- Breadcrumb-based nested folder navigation. **Manage mode** for bulk rename/delete.
- Visibility control: toggle recipes Private/Public; **Bulk Visibility** tool to set all of a user's recipes at once.

### 7.5 Social
- Remix / "Save my version" (copy created on save), comments, follow — integrated into the recipe view.

---

## 8. Voice Command System

A natural-language voice system enabling fully hands-free use. Pages can register their own context-specific voice actions.

**Navigation**: "Go to home", "Open my library", "Go to create page", "Open my profile", "Go to Discover".
**Playback**: "Pause", "Resume", "Next step", "Previous step", "Repeat" (loop current segment again), "Speed up", "Slow down".
**Jumps**: "Jump to step 3", "First step", "Last step".
**Speed**: "Set speed to 1.5", "Half speed", "Normal speed".
**Search & folders**: "Search for chicken", "Open my Italian folder".
**In-player cooking**: "Next step", "Repeat step", "Pause", "Save recipe".
**Page-specific**: pages register custom actions (e.g., "Clear search" on Discover).
**Mode readout**: user can ask the player to speak the current mode ("what mode am I in") and hear it.

Parsing should be resilient to natural phrasings and must be covered by automated tests.

---

## 9. Cross-Cutting Requirements

- **Shared account & data** across mobile and desktop; UI preferences (theme, sidebar) persist per-user across devices.
- **Theming**: light + dark mode ("chef" aesthetic — teal primary, rounded cards, dense info layout).
- **Video abstraction**: a single layer that unifies local HTML5 video and embedded YouTube/Vimeo so loop/wait/continuous behavior is identical across sources. Embedded players require simulated looping (seek back at boundary) since native loop control is limited.
- **Resilient sharing**: shared links must render for signed-out visitors; never show a blank page on a valid shared/remix link.
- **Failure transparency**: AI analysis and video import should fail loudly with clear user feedback, not silently produce empty recipes.
- **Automated test coverage** for the highest-risk behaviors: voice-command parsing, step-chip seeking, YouTube step-jumping, loop/wait boundary behavior, and the remix "save my version" flow.

---

## 10. Suggested Build Order

1. **Backend foundation** — data model, auth + local-user provisioning, recipe CRUD, `canViewRecipe` rules.
2. **Core player** — loop/wait/continuous engine over uploaded HTML5 video, step strip, step chips (with seeking).
3. **Editor** — loop-stop placement, step editing, cover capture, privacy/publish.
4. **Video abstraction** — add YouTube/Vimeo embed support with simulated loop/wait.
5. **Library, folders, saving, discovery feed.**
6. **Widgets / boards** (home + profile), drag-resize, carousels.
7. **Social** — follow, comments (step-pinned), public profiles.
8. **Remix / save-my-version** + link sharing for signed-out visitors.
9. **AI analysis** — analyze-video / analyze-youtube / analyze-social, three modes.
10. **Voice commands** (global nav + in-player), with tests.
11. **Desktop-only power features** — workshop multi-step mode, seek-step config, undo/redo, bulk visibility/manage tools.

---

## 11. Out of Scope (v1)

- Native iOS/Android apps (web only).
- Payments/monetization.
- Real-time collaboration on a recipe.
- Recipe versioning history beyond remix attribution.
- Recommendation ML beyond chronological/public feed.

---

## Relevant files
- `lib/db/src/schema/recipes.ts`
- `lib/db/src/schema/users.ts`
- `lib/db/src/schema/folders.ts`
- `lib/db/src/schema/comments.ts`
- `lib/db/src/schema/widgets.ts`
- `artifacts/api-server`
- `artifacts/cooking-gps`
- `artifacts/cooking-gps-desktop`
