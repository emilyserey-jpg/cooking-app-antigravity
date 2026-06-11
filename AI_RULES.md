# Cooking GPS - Developer & AI Agent Guidelines

This file outlines strict architectural constraints and build instructions for developers and AI coding assistants working on the Cooking GPS repository.

## Commands

- **Start Local Server**: `npm start` (Runs Node Express server on port 8000)
- **Check Syntax**: `node -c app.js` (Note: client-side ES modules will warn about import statements outside modules, which is normal)
- **Restart Backend**: Kill the active PID serving `server.js` and run `npm start` again.

---

## Strict AI Pipeline Rules (DO NOT CHANGE)

### 1. Contiguous Timeline Partitioning for Transcripts
- **What it is**: For any transcript-based step or description generation, the video timeline must be partitioned **contiguously** with **no gaps** and **no overlaps**. 
- **The Rule**: Each Step `i` covers the range from its start time (`step.time`) exactly up to the next step's start time (`steps[i+1].time` or the end of the video).
- **Why**: 
  - Direct loop-stop boundaries (`endTime`) must **never** be used for transcript queries. Doing so leaves gaps in the timeline where spoken words are lost, and causes overlaps where adjacent step transcripts bleed into each other.
  - Grouping segments must not be done coarsely.
- **Implementation**: The helper `window.getTranscriptForSteps` in [app.js](file:///Users/emilyserey/Desktop/App/app.js) implements this contiguous range logic and delegates to `window.getTranscriptForTimeRange` (the word-by-word precise estimator) under the hood. The backend `/api/ai/describe-steps` endpoint in [server.js](file:///Users/emilyserey/Desktop/App/server.js) uses the same contiguous maximum-overlap grouping algorithm.

### 2. Word-by-Word Description Priority
- **What it is**: Step descriptions/textareas must show the exact word-for-word spoken transcript of the matching audio.
- **The Rule**: Always prioritize the exact word-for-word spoken transcript (`wordForWordDesc`) as the step's primary description. Only fall back to Gemini-synthesized instructions or labels if there is no speech at all during that timeframe.
- **Why**: Synthesized descriptions lose exact step phrasing and details. The user wants the player steps to show exactly what was spoken in the video.

### 3. Client Script Cache-Busting
- **What it is**: The client scripts `app.js` is cached heavily by mobile and desktop browsers.
- **The Rule**: Whenever making changes to `app.js`, you **MUST** increment the version query parameter inside the script tag in both `index.html` and `mobile.html` (e.g., `<script type="module" src="app.js?v=7.1"></script>` to `?v=7.2`).
- **Why**: Otherwise, users will continue running old cached client code.
