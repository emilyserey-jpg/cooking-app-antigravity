# Workspace Rules

This file defines project-specific style guidelines and behavioral constraints.

---

## Flexbox Layouts with Scrollable Cards and Auto-Growing Textareas

When styling card elements that are scrollable vertically (`overflow-y: auto`) and contain auto-resizing textareas (like notes/descriptions) alongside other input controls (like timers/ingredients):

1. **Height Capping**: Enforce a fixed maximum height limit (e.g. `max-height: 200px;`) and vertical scroll support (`overflow-y: auto;`) directly on the textarea element.
2. **Prevent Squeezing**: You MUST apply `flex-shrink: 0` (or `flex: 0 0 auto;`) to both the textarea element and its immediate wrapper container. If omitted, the browser flexbox algorithm will shrink the textarea wrapper down to its minimum height when space is constrained, preventing the textarea from expanding to its maximum limit.
3. **Card-Level Scroll Trigger**: Ensure all surrounding card elements are positioned statically or have flex-shrink disabled so the card correctly overflows and triggers card-level scrollbars when total content height exceeds the list/viewport boundaries.
