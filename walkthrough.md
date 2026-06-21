# Active Styled Layout Options Dropdown Menu Walkthrough

This walkthrough details the changes made to group the layout action buttons into a single premium dropdown menu matching the styling of the active editor tab dropdown selector.

---

## 🛠️ Latest Features & Adjustments

### 1. Active-Styled Layout Options Dropdown Menu
- **Visual Design**: Replaced the standalone `Switch Spots` and `Full Width` buttons with a single dropdown button `Layout ▼` (`#layoutDropdownBtn`).
- **Dynamic Active Styling**:
  - **Inactive Style**: Displays matching the tab selector button default state (`background: var(--bg-card-soft); color: var(--text-body); border: 2px solid var(--border-card);`).
  - **Active State Highlights**: If the layout has customized states (either panels swapped or Full Width mode is active), the button transforms into a primary gradient state (`background: linear-gradient(135deg, var(--primary), var(--primary-hover)); color: #fff; border: transparent; box-shadow: 0 4px 12px var(--primary-glow);`), matching the active tab selector style.
- **Glass-Card Menu Options**: Displays borderless options inside a premium `#layoutDropdownMenu` (with `glass-card` classes and Webkit shadow overlays):
  - **Switch Spots**: Swaps playback controls and editor panel locations (`toggleSwapPanels()`).
  - **Full Width / Column Layout**: Toggles the bottom editor full-width recipe editor layout (`toggleRecipePanelLayout()`).
- **Automatic Styling State Machine**: Wired up `window.syncLayoutDropdownBtnStyle` to automatically evaluate layout mode states and open/closed dropdown states to apply correct transitions and background highlights.
- **Test Compatibility**: Option element IDs remain `#swapPanelsBtn` and `#editorFullWidthBtn`, maintaining complete coverage with all automated browser test scripts.

### 2. Cache Version Bumps
- Bumped page version and cache keys to `v=9.73` in `index.html` and `mobile.html` to instantly load the new layout options code.

---

## 🧪 Verification Results

All tests run in the Chrome DevTools browser session passed successfully:

| Test Script | Status | Description |
| :--- | :--- | :--- |
| `test_layout_swapping.js` | **PASSED** ✅ | Verifies that clicking "Switch Spots" inside the dropdown swaps panels symmetrically, and ensures no regressions with layout controls. |
| `test_collapsible_panels.js` | **PASSED** ✅ | Verifies that collapsible panels (sidebar and timeline) collapse and expand cleanly in both standard and swapped layouts. |
| `test_layout_behavior.js` | **PASSED** ✅ | Verifies that switching layouts, swapping panels, and collapsing/uncollapsing bottom panels correctly synchronizes active tab page visibility. |

---

# Hiding Panel Column Vertical Scrollbars Walkthrough

This walkthrough details the visual improvements to hide vertical scrollbars inside the Recipe Editor panel column views.

---

## 🛠️ Latest Features & Adjustments

### 1. Hide Column Vertical Scrollbars
- **Webkit Scrollbar Override**: Added CSS selectors to hide the scrollbar (`display: none`) on Chrome, Safari, and other Webkit browsers for all 5 vertical editor panel column views:
  - `#rightColStops` (Loop stops & cards editor)
  - `#rightColIngredients` (Ingredients text editor)
  - `#rightColTranscripts` (Transcription editor)
  - `#rightColSave` (Details & save options)
  - `#rightColAddCustom` (Custom pages selector)
- **Inline Fail-safes**: Added inline `scrollbar-width: none; -ms-overflow-style: none;` declarations to all 5 container elements in `index.html` to guarantee cross-browser scrollbar hiding.
- **Unobstructed Scrollability**: The columns remain 100% functional, allowing users to scroll vertically via touchpads, mouse wheels, and touch swiping, but without displaying cluttered scrollbars on-screen.

### 2. Cache Version Bumps
- Bumped page version and cache keys to `v=9.71` in `index.html` and `mobile.html` to instantly force cache refresh.

---

## 🧪 Verification Results

All tests run in the Chrome DevTools browser session passed successfully:

| Test Script | Status | Description |
| :--- | :--- | :--- |
| `test_collapsible_panels.js` | **PASSED** ✅ | Verifies that collapsible panels (sidebar and timeline) collapse and expand cleanly in both standard and swapped layouts. |
| `test_layout_behavior.js` | **PASSED** ✅ | Verifies that switching layouts, swapping panels, and collapsing/uncollapsing bottom panels correctly synchronizes active tab page visibility and avoids stacked columns. |
| `test_layout_swapping.js` | **PASSED** ✅ | Verifies that clicking "Switch Spots" swaps panels symmetrically, and ensures no regressions with the layout controls. |

---

# Workbench Layout Initialization & Drag-Scroll Prevention Walkthrough

This walkthrough details the layout width constraints initialization fixes and native drag event prevention overrides inside the Recipe Editor panel.

---

## 🛠️ Latest Features & Adjustments

### 1. Workbench Layout Initialization Fix
- **The Bug**: On first load or recipe page transitions, the layout switcher `switchWorkbenchLayout` was not invoked. This left the right-hand panel `#workbenchRight` with standard unconstrained CSS flexbox values. Consequently, when multiple step cards were loaded, the panel stretched to the full `1920px` width of `#createStepsList`, extending completely off-screen and leaving no visible overflow in the parent columns (making horizontal carousels appear locked/frozen).
- **The Fix**: Added an explicit call to `window.switchWorkbenchLayout('standard')` inside `initCreateView` in `app.js`. This guarantees that the layout is initialized and constrained to its exact target width (e.g. `420px`) on load, allowing the children rows to overflow and scroll horizontally.

### 2. Native Dragstart Prevention
- **HTML5 Drag Override**: Added a `dragstart` event listener inside `window.enableDragScroll` that calls `e.preventDefault()`. This disables the browser's default HTML5 element drag-and-drop operations on buttons and text selections, ensuring that custom mouse drag-scrolling executes smoothly and uninterrupted in all desktop browsers.

---

## 🧪 Verification Results

All tests run in the Chrome DevTools browser session passed successfully:

| Test Script | Status | Description |
| :--- | :--- | :--- |
| `test_drag_scroll.js` | **PASSED** ✅ | Simulates mouse click and drag-left actions on `#aiButtonsRow`, and asserts that the scrollLeft value successfully increases. |
| `test_collapsible_panels.js` | **PASSED** ✅ | Verifies that collapsible panels (sidebar and timeline) collapse and expand cleanly in both standard and swapped layouts. |
| `test_layout_behavior.js` | **PASSED** ✅ | Verifies that switching layouts, swapping panels, and collapsing/uncollapsing bottom panels correctly synchronizes active tab page visibility and avoids stacked columns. |
| `test_layout_swapping.js` | **PASSED** ✅ | Verifies that clicking "Switch Spots" swaps panels symmetrically, and ensures no regressions with the layout controls. |

---

# Mouse Drag-to-Scroll on Header Rows Walkthrough

This walkthrough details the changes made to enable horizontal mouse drag-scrolling on all Recipe Editor header rows and lists containing buttons.

---

## 🛠️ Latest Features & Adjustments

### 1. Drag-Scroll Mouse Threshold & Interception
- **Mouse Drag-Scroll on Buttons**: Refactored `window.enableDragScroll` in `app.js` to allow mouse dragging on buttons while maintaining selection safety (ignoring dragging on textareas and inputs).
- **5-Pixel Threshold**: Implemented a 5-pixel mouse movement threshold to clearly differentiate a horizontal scroll gesture from a simple click/tap.
- **Click Event Interception (Capture Phase)**: Added a capture-phase event listener on the scroll container. If a drag occurs, it captures and discards the click event (`e.preventDefault()`, `e.stopPropagation()`). This prevents child button click actions from firing when dragging concludes.
- **Normal Click Preservation**: If the mouse moves 5 pixels or less, the gesture is classified as a click and is passed down to trigger the button's action handler normally.

### 2. Carousel Row Scroll Bindings
- Wired up the drag-scroll handler to the following 5 scrollable rows during page initialization:
  - `#editorTabBar` (Desktop editor tab bar)
  - `#editorTabBarMobile` (Mobile editor tab bar)
  - `#aiButtonsRow` (Desktop AI buttons row)
  - `#aiButtonsRowMobile` (Mobile AI buttons row)
  - `#createStepTabs` (Step tabs selector row)

### 3. Cache Version Bumps
- Bumped page version and cache keys to `v=9.70` in `index.html` and `mobile.html` to instantly apply the updated `app.js` script.

---

## 🧪 Verification Results

All tests run in the Chrome DevTools browser session passed successfully:

| Test Script | Status | Description |
| :--- | :--- | :--- |
| `test_collapsible_panels.js` | **PASSED** ✅ | Verifies that collapsible panels (sidebar and timeline) collapse and expand cleanly in both standard and swapped layouts. |
| `test_layout_behavior.js` | **PASSED** ✅ | Verifies that switching layouts, swapping panels, and collapsing/uncollapsing bottom panels correctly synchronizes active tab page visibility and avoids stacked columns. |
| `test_layout_swapping.js` | **PASSED** ✅ | Verifies that clicking "Switch Spots" swaps panels symmetrically, and ensures no regressions with the layout controls. |

---

# Horizontal Carousel Header Rows Walkthrough

This walkthrough details the changes made to convert the header control rows in the Recipe Editor panel into independent, horizontally scrollable carousels.

---

## 🛠️ Latest Features & Adjustments

### 1. Carousel Rows Layout & Flex Protection
- **Row 1 (Tabs)**: Configured the desktop tab bar (`#editorTabBar`) to hide native scrollbars on Webkit browsers while keeping its horizontal scrolling intact.
- **Row 2 (AI Buttons)**: Grouped the AI buttons into a dedicated row `#aiButtonsRow` (desktop) and `#aiButtonsRowMobile` (mobile) with horizontal scrolling, flex direction, and flex shrink protection to prevent buttons from shrinking or wrapping.
- **Row 3 (Step Tabs)**: Configured the step tab buttons inside `#createStepTabs` (desktop) to use `flex-shrink: 0` and `white-space: nowrap` styles dynamically in `app.js` to prevent shrinkage when scrolling.
- **Row 4 (Step Cards List)**: Added inline scrollbar hiding styles to `#createStepsList` on both desktop and mobile layouts.

### 2. Scrollbar Hiding
- Added custom Webkit scrollbar hiding styles (`display: none`) in all stylesheets (`styles.css`, `styles_v853.css`, `mobile.css`, `mobile_v853.css`) for all header rows and the card list.

### 3. Cache Version Bumps
- Bumped page version and cache keys to `v=9.69` in `index.html` and `mobile.html` to instantly apply stylesheet and javascript updates.

---

## 🧪 Verification Results

All tests run in the Chrome DevTools browser session passed successfully:

| Test Script | Status | Description |
| :--- | :--- | :--- |
| `test_collapsible_panels.js` | **PASSED** ✅ | Verifies that collapsible panels (sidebar and timeline) collapse and expand cleanly in both standard and swapped layouts. |
| `test_layout_behavior.js` | **PASSED** ✅ | Verifies that switching layouts, swapping panels, and collapsing/uncollapsing bottom panels correctly synchronizes active tab page visibility and avoids stacked columns. |
| `test_layout_swapping.js` | **PASSED** ✅ | Verifies that clicking "Switch Spots" swaps panels symmetrically, and ensures no regressions with the layout controls. |

---

# Anchoring Panel Collapse Buttons to Video Player Edges Walkthrough

This walkthrough details the changes made to move the collapse handle buttons (`#sidebarCollapseBtn` and `#timelineCollapseBtn`) so they are anchored directly to the edges of the video player container (`#workbenchVideoWrapper`), ensuring they stick adjacent to their respective collapsible panels and dynamically scale without manual reparenting.

---

## 🛠️ Latest Features & Adjustments

### 1. Centralized Button Syncing
- **Central sync function (`window.syncCollapseButtons`)**: Created a centralized function in `app.js` to manage both `#sidebarCollapseBtn` and `#timelineCollapseBtn` parent, style, position, and icon updates.
- **Right Edge Anchoring for Sidebar Toggle**: The vertical collapse button (`#sidebarCollapseBtn`) is permanently parented by `#workbenchVideoWrapper` and positioned on its right-hand edge: `right: 0; left: auto; top: 50%; transform: translate(100%, -50%); border-radius: 0 8px 8px 0;` (completely outside the video player boundaries).
- **Bottom Edge Anchoring for Timeline Toggle**: The horizontal collapse button (`#timelineCollapseBtn`) is permanently parented by `#workbenchVideoWrapper` and positioned on its bottom edge: `bottom: 0; top: auto; left: 50%; transform: translate(-50%, 100%); border-radius: 0 0 8px 8px;` (completely below the video player bottom boundary).
- **Adaptive Text Icon Directions**:
  - Sidebar collapsed: `‹` (points left to pull/expand panel)
  - Sidebar expanded: `›` (points right to push/collapse panel)
  - Timeline collapsed: `∧` (points up to expand panel)
  - Timeline expanded: `∨` (points down to collapse panel)

### 2. Panel Collapse Code Refactoring
- **Removed Dynamic Parenting**: Cleared dynamic `appendChild`/`insertBefore` parenting overrides from `syncWorkbenchLayoutUI()`, `toggleEditorSidebar()`, and `toggleHorizontalPanel()`.
- **Simplified Style Mutators**: Cleared inline style overrides for the collapse handles inside `toggleEditorSidebar()` and `toggleHorizontalPanel()`, substituting them with calls to `window.syncCollapseButtons()`.

### 3. Stylesheet Updates
- **`styles.css` & `styles_v853.css`**: Updated `.collapse-handle-vertical` to `border-radius: 0 8px 8px 0` and `.collapse-handle-horizontal` to `border-radius: 0 0 8px 8px` to ensure buttons have correct rounded corners pointing outwards when sticking to the right/bottom of the video player.

### 4. Layout Spacing / Clearance
- **Clearance Zone below Video**: Added `margin-bottom: 16px` to `#workbenchVideoWrapper` in `index.html`. Together with the layout container's default gap, this creates a clean 24px clearance area below the video. The horizontal timeline collapse button now floats freely within this gap, completely eliminating overlap with the controls buttons below it.

### 5. Unified Layout Toggle Buttons Size
- **Unified Button Styling**: Configured the timeline controls layout buttons (`#swapPanelsBtn2` and `#playbackControlsLayoutBtn`) to exactly match the larger size and premium styling of the tab bar buttons (`#swapPanelsBtn` and `#editorFullWidthBtn`).
- **Uniform Dimensions**: Updated the overriding width to a uniform `130px !important` in both `styles.css` and `styles_v853.css`.
- **Matched Spacing & Font Weight**: Adjusted the inline styles in `index.html` for both scrubber control buttons to use a height padding of `6px 12px`, border-radius of `10px`, border thickness of `2px`, and font-weight of `900` to make them identical to the tab bar toolbar buttons.

### 6. Horizontal Carousel & Scroll Snapping for Step Cards
- **CSS Scroll Snapping**: Added `scroll-snap-type: x mandatory` and `scroll-behavior: smooth` to `#createStepsList` in `app.js` to enable snap-scrolling on loop stop cards.
- **Card Center Snapping**: Added `scroll-snap-align: center` to the template of each step card (`.loop-stop-card`) so that swiping left/right automatically aligns the active/closest card perfectly in the center of the list view.
- **Drag-Scroll Snap Suspension**: Modified `window.enableDragScroll` to set `el.style.scrollSnapType = 'none'` on `mousedown` and restore it on `mouseup`/`mouseleave`. This completely eliminates mouse drag scrolling jitter on desktop, keeping dragging smooth and snapping only when the mouse is released.
- **Cache Refresh**: Bumped asset query versions to `9.68` in `index.html` and `mobile.html`.

---

## 🧪 Verification Results

All tests run in the Chrome DevTools browser session passed successfully:

| Test Script | Status | Description |
| :--- | :--- | :--- |
| `test_collapsible_panels.js` | **PASSED** ✅ | Verifies that collapsible panels (sidebar and timeline) collapse and expand cleanly in both standard and swapped layouts. |
| `test_layout_behavior.js` | **PASSED** ✅ | Verifies that switching layouts, swapping panels, and collapsing/uncollapsing bottom panels correctly synchronizes active tab page visibility and avoids stacked columns. |
| `test_layout_swapping.js` | **PASSED** ✅ | Verifies that clicking "Switch Spots" swaps panels symmetrically, and ensures no regressions. |

---

# Layout Restoration & Swapping Option Walkthrough

This walkthrough details the restoration of the panel swapping ("Switch Spots") button and the layout selector dropdown in the desktop Recipe Editor workbench.

---

## 🛠️ Restored Features & Layout Controls

### 1. "Switch Spots" Panel Swapping Buttons
- **Locations**:
  1. Placed in the editor tab bar (`#editorTabBar`) on the right-hand side, next to the "Full Width" toggle button.
  2. Placed in the Playback & Edit Controls card header (`#stepNavControlsRow`), next to the "Full Width" toggle button.
- **Icons**: Embedded modern, crisp inline Lucide-style SVG icons (`arrow-left-right`) with no emojis.
- **Behavior**: Both buttons call `window.toggleSwapPanels()`, which alternates the positions of the recipe editor panel (`#recipePanelWrapper`) and the video playback controls (`#editorScrubberCard` and `#stepNavControlsRow`). This allows the user to easily swap the panels back from whichever side they are on.
- **Styling**: Dynamically styled with active state highlighting matching the theme colors when active (`var(--primary-light)` background, `var(--primary)` text color) on both buttons simultaneously.

### 2. Layout Selector Dropdown
- **Location**: Placed in the editor tab bar (`#editorTabBar`) next to the editor tab selector button.
- **Icon**: Formatted as a dropdown element showing the active layout name with a caret (`▼`) and no emojis.
- **Behavior**: Triggers the dynamic layout popup dropdown showing:
  1. **Standard Layout**
  2. **Bottom Playback Controls**
  3. **Bottom Editor / Timeline**
- **Emoji-Free Updates**: Swapped out all original emojis from the dropdown options and replaced them with premium, crisp inline SVG icons representing each layout type. Removed emojis from layout mode transition labels.

### 3. Horizontal Scrollability in Swapped View
- **Problem**: When swapped to the right-hand column (`#workbenchRight`), the narrower panel width (`420px`) clipped the time/duration indicators on the scrubber timeline and cut off some editor control buttons on the right.
- **Fix**:
  - Configured `#editorScrubberCard` and `#stepNavControlsRow` with `overflow-x: auto` and a thin scrollbar (`scrollbar-width: thin`).
  - Wrapped their inner contents in a minimum-width container (`min-width: 460px`).
  - This prevents the timeline elements and button groups from getting squished or clipped on narrow viewports, allowing smooth left-and-right scrolling so all controls and indicators are fully viewable and interactive.

---

## 🧪 Verification Results

All tests run in the Chrome DevTools browser session passed successfully:

| Test Script | Status | Description |
| :--- | :--- | :--- |
| `test_layout_swapping.js` | **PASSED** ✅ | Verifies presence of new buttons, clicks "Switch Spots" to assert DOM element movement, clicks again to toggle back, opens the layout selector dropdown, and asserts emoji-free text strings. |

---

## 📸 Screenshots

### Desktop Editor View (Restored Options in Tab Bar)
Below is the screenshot showing the restored **Layout Selector** dropdown and **Switch Spots** button inside the editor tab bar:

![Restored Layout Options](/Users/emilyserey/.gemini/antigravity/brain/c17a7a00-6a4f-49be-8952-7228cb907909/screenshot_editor_view.png)

### Desktop Editor View (Swapped Spots Layout)
Below is the screenshot captured after clicking **Switch Spots**, swapping the recipe description panel to the left side and the video controls to the right column:

![Swapped Spots Layout](/Users/emilyserey/.gemini/antigravity/brain/c17a7a00-6a4f-49be-8952-7228cb907909/screenshot_swapped_editor_view.png)

---

## 🐛 Video Player Error Overlay Bug Fix

### What Happened
When loading a recipe that has no video file uploaded (i.e. `video_url: null` or empty, such as the newly created `cook_j027rwz6` test recipe), the player is configured to hide the video element and display the Wii-style canvas cutting board illustration instead.

However, the application was setting `realVideo.src = ''` to clear the video source. This action triggered a false-positive `error` event in the browser, which was immediately captured by the global video error event listener. Because the listener detected a media load error, it incorrectly displayed the "Video Unavailable" error overlay, covering up the canvas placeholder card.

### How It Was Resolved
Added a guard clause to the top of the video error event listener in `app.js`:
- It retrieves the active recipe from `playerCurrentRecipe` or `recipeData`.
- If the recipe has no video URL, or if the source is empty/cleared, or if it resolves to the base page URL (`window.location.href`), it immediately hides the error overlay and returns.
- This ensures the error overlay is *only* shown when a valid video URL actually fails to load, allowing the canvas placeholder to render correctly for recipes without videos.

---

## 🛟 Database Recipe Video URL Recovery

### Finding
In the database, the user's latest recipe `cook_j027rwz6` ("Fresh Tomato Angel Hair Pasta test") had its `video_url` set to `null` due to the previous save/overwrite bug (which has been patched). This caused the player to load the recipe but fall back to the canvas placeholder illustration instead of rendering the video.

### Fix
- Wrote and executed a database repair script `fix_recipe_video.js` that updated `cook_j027rwz6`'s `video_url` field to point back to the correct Supabase storage URL (`https://rsnzjvcpuwtuwzxbnnic.supabase.co/storage/v1/object/public/videos/emilyserey_gmail_com/1781384724721_8pgye.mp4`).
- This immediately restores video rendering and playback for your latest pasta recipe.

---

## 🛠️ Workbench Vertical Resizer Fix

### The Problem
The vertical divider resizer bar (`#workbenchResizer`) was locked and unable to resize the columns. This was caused by CSS flexbox rules (`flex: 1 1 auto` and `flex: 0 1 420px`) applied dynamically inside `switchWorkbenchLayout` when rendering the standard or swapped column configurations. Because `flex-basis` overrides the inline `width` property in CSS flex layouts, any changes to `leftCol.style.width` during dragging were ignored by the browser.

### The Solution
1. **Dynamic Fixed Column Width**: Replaced the hardcoded `420px` column width references inside `switchWorkbenchLayout` and `toggleEditorSidebar` with a dynamic `window.workbenchFixedColumnWidth || 420` variable.
2. **Synchronized Drag Updates**: Updated the resizer mouse dragging event handler (`onMouseMove` in `setupWorkbenchResizer()`) to recalculate the fixed column width based on the cursor position relative to the workbench grid container boundaries:
   - **Normal Layout**: `newFixedW = gridRect.right - e.clientX` (since the right column is fixed).
   - **Swapped Layout**: `newFixedW = e.clientX - gridRect.left` (since the left column is fixed).
3. **Flex Overrides Clear**: The dragging handler now dynamically updates both columns' inline `width` AND `flex-basis` attributes (`style.flex = '0 1 ' + newFixedW + 'px'`) during dragging. This allows the layout to adapt fluidly in real-time, letting the user shrink or expand either panel freely down to `320px`.

---

## 🧪 Verification Results

All tests run in the Chrome DevTools browser session passed successfully:

| Test Script | Status | Description |
| :--- | :--- | :--- |
| `test_layout_swapping.js` | **PASSED** ✅ | Verifies presence of new buttons, clicks "Switch Spots" to assert DOM element movement, clicks again to toggle back, opens layout dropdown, and asserts emoji-free text. |
| `test_resizer_dragging.js` | **PASSED** ✅ | Simulates mouse drag events to verify relative widths resize correctly in standard layout, and shifts positions correctly in swapped layout. |
| `test_folder_slideshow.js` | **PASSED** ✅ | Mocks library state in localStorage, transitions to the Profile tab, and asserts that the first recipe's default thumbnail and glassmorphic corner folder badge render immediately, then simulates hover (mouseenter/mouseleave) to verify video autoplay and image carousel loops start and stop correctly. |
| `test_symmetrical_swapping.js` | **PASSED** ✅ | Verifies that clicking "Switch Spots" in standard, bottom-controls, and bottom-editor layouts swaps column panels symmetrically while maintaining column visibility. |

---

## 📂 Folder Video Slideshow Preview on Hover

### The Goal
Provide a premium, active preview inside the folder cards (`.bento-widget`) on both the Library tab ("Folders & Videos" via `libFolderCardHTML`) and Profile tab ("My Space" via `mySpaceRenderFolderStrip`) that showcases a slideshow of the recipes and videos stored inside that folder.

### The Solution
1. **Default Video Thumbnail Banner**: Instead of showing the plain folder SVG icon by default, the card renders the **thumbnail image of the first video/recipe** inside the folder as a full-bleed banner covering the top 70% of the card.
2. **Semi-Transparent Folder Badge**: Placed a small, elegant, semi-transparent glassmorphic folder badge (`28x28px`, rounded, with a `backdrop-filter: blur(8px)`) in the top-left corner of the banner. This provides a clean visual indicator that the card is a folder rather than a single recipe.
3. **Hover-Triggered Slideshow**: When the mouse enters the card, the slideshow starts cycling through all videos and thumbnails inside the folder:
   - **Autoplay Muted Videos**: Videos play muted and loop inline inside the banner container.
   - **Static Image Fallback**: If a recipe only has a thumbnail image (no video), it displays the image in the banner.
   - **Automatic Carousel loop**: Cycles to the next media file in the folder every `2.5` seconds while hovered.
4. **Resets on Mouse Leave**: Once the user stops hovering, the slideshow interval is cleared, active video instances are released, and the card banner restores back to displaying the first recipe's static thumbnail image.

---

## ↔️ Symmetrical Column Layout Swapping

### The Goal
Provide a premium, logical column swapping experience in the Recipe Editor workbench by ensuring that "Switch Spots" swaps columns symmetrically rather than manually splitting controls or shifting layout modes.

### The Solution
1. **Standard Layout**: Swapping columns places the Step Editor (`recipePanel`) on the Left, and keeps the Video player + Scrubber + Playback controls together in the Right Column. Both columns remain visible and resizable.
2. **Bottom Controls Layout**: Swapping columns places the Step Editor (`recipePanel`) in the Left Column, and the Video player in the Right Column. The Scrubber and Playback controls stay neatly docked at the Bottom of the screen. Both columns remain visible and resizable.
3. **Bottom Editor Layout**: Swapping columns places the Scrubber and Playback controls in the Left Column, and the Video player in the Right Column. The Step Editor stays neatly docked at the Bottom of the screen. Both columns remain visible and resizable.
4. **Resizer Dragging**: Updated `setupWorkbenchResizer` so that dragging constraints adapt dynamically to the swapped state. In all layout modes, if panels are swapped, the Left column becomes the fixed-width column and the Right column becomes the flex-width column, ensuring smooth dragging regardless of screen layout.
5. **Toggle Logic**: Simplified `window.toggleSwapPanels` to swap columns within the *current* layout mode rather than toggling/altering the selected layout mode.

---

## 🛠️ Step Description Card Border-Radius Adjustment

- **Goal**: Make the recipe step card on the player view look less round.
- **Solution**: Changed the border-radius of the `.step-slider-card` element from `var(--radius-lg)` (and the overridden `24px !important` values) to `var(--radius-sm)` (10px) in all active stylesheets (`styles_v853.css`, `mobile_v853.css`, `styles.css`, `mobile.css`).
- **Result**: Provides a clean, modern, and structured look for the active step cards.
- **Cache Refresh**: Bumped the application version and stylesheet link version parameters to `v=9.60` in `index.html` and `mobile.html` to load the changes immediately.

---

## 🎨 Step Card Visual Alignment (Player vs Editor)

### The Goal
Align the styling of the step description card in the player view (`.step-slider-card`) with the editor's step card (`.loop-stop-card`), sharing the Wii-inspired frosted glass aesthetic, custom pastel border colors, and color-matched glowing shadows.

### The Solution
1. **Dynamic Custom Properties**: Updated `renderStepCardsMobile()` in `app.js` to retrieve each step's pastel color (`STEP_COLORS`) and calculate a matching custom `rgba` glow color. These are applied directly to the `.step-slider-card` wrapper element as CSS custom variables (`--step-color` and `--step-glow-color`).
2. **Frosted Glass Styling**: Redesigned `.step-slider-card` inside all four stylesheet files (`styles_v853.css`, `mobile_v853.css`, `styles.css`, `mobile.css`):
   - **Background**: Semi-transparent frosted glass (`rgba(255, 255, 255, 0.7)`).
   - **Blur**: `backdrop-filter: blur(8px)`.
   - **Border**: Set to the step's specific pastel color `var(--step-color)`.
   - **Shadow**: Subtle card shadow (`rgba(0, 0, 0, 0.03)`).
3. **Active Highlights**: Updated `.step-slider-card.active`:
   - Thicker border (`3.5px solid var(--step-color)`).
   - Glow shadow set to match the editor's signature purple glow (`rgba(124, 58, 237, 0.3) !important`) for clear separation on light backgrounds.
   - Scale-up transform and transition alignment.
4. **Indicator Colors**: Set `.step-indicator-text` to use `var(--step-color)` for consistent visual labeling.
5. **Cache Refresh**: Bumped version query parameters to `?v=9.62` in `index.html` and `mobile.html` for both stylesheets and application scripts.

---

## 🍲 Step-Specific Ingredients Overlay Modal

### The Goal
Make step-specific ingredients visible on the published recipe player page via a toggleable overlay/modal on the step card.

### The Solution
1. **Toggle Ingredients Button**: Added a clean "Ingredients" button next to the time badge inside the card's metadata row if the step has ingredients.
2. **Ingredients Modal**: Added a premium modal structure (`#playerStepIngredientsModal`) in both `index.html` and `mobile.html` with a semi-transparent frosted glass backdrop blur.
3. **Dynamic Loading**: Implemented `openStepIngredientsModal()` to dynamically format and populate the list of ingredients for the active step when the button is clicked.
4. **Database Load Fix**: Fixed a bug inside `window.loadPlayerRecipe` where the `ingredients` array inside loop structures from the database was not being mapped to `recipeData.steps`, leaving the player card's step ingredients array empty. Now they are correctly loaded as `ingredients: l.ingredients || []` on start.

---

## 📸 Screenshots

### Redesigned Player Active Card Glow & Ingredients Button
Below is the player view showing the new purple active glow, matching step borders, and the "Ingredients" button:

![Player Active Glow](/Users/emilyserey/.gemini/antigravity/brain/c17a7a00-6a4f-49be-8952-7228cb907909/screenshot_player_view_new.png)

### Step-Specific Ingredients Overlay Modal
Below is the screenshot showing the toggleable modal displayed when clicking "Ingredients":

![Step Ingredients Modal](/Users/emilyserey/.gemini/antigravity/brain/c17a7a00-6a4f-49be-8952-7228cb907909/screenshot_step_ingredients_modal.png)

---

## ↕️ Border-Anchored Collapsible Panels Handle Positioning Fix

### The Problem
The collapse/expand panel toggle handles (`#sidebarCollapseBtn` and `#timelineCollapseBtn`) were positioned using absolute pixel offsets relative to the main workbench container (`#workbenchGrid` and `#workbenchLeft`). 
- When screen resolutions changed or column layouts were swapped, these handles would float disconnectedly in the middle of screen graphics, overlapping video elements or action buttons.
- In standard layout, if the left column content was long, scrolling the left column would scroll the timeline collapse button away, floating it in the middle of the screen.

### The Solution
1. **Direct DOM Parenting**:
   - Relocated `#sidebarCollapseBtn` to be a child of the right-hand column itself (`#workbenchRight`).
   - Relocated `#timelineCollapseBtn` to be a child of the active horizontal panel (which is `#editorScrubberWrapper` in standard normal layout, `#recipePanelWrapper` in standard swapped layout, or `#workbenchBottom` in bottom layout modes), dynamically updated and reparented in JS when layout modes or panel spots are switched.
2. **Dynamic Border Centering**:
   - Used CSS absolute coordinates relative to the panel container itself:
     - **Sidebar Button**: Placed at `left: 0` (standard layout, centering on left border of `#workbenchRight`) or `right: 0` (swapped layout, centering on right border) with `transform: translate(±50%, -50%)`.
     - **Timeline Button**: Placed at `top: 0` (centering on top border of the active bottom panel) with `transform: translate(-50%, -50%)`.
   - Set the container elements to `position: relative; overflow: visible;`.
3. **Robust Height & Width Collapsing**:
   - Refactored `toggleEditorSidebar()` to collapse the right column by setting `width: 0px`, `minWidth: 0px`, `padding: 0px`, `margin: 0px` and hiding all its inner children except `#sidebarCollapseBtn`. This keeps the border-anchored button visible at the exact screen edge when collapsed.
   - Refactored `toggleHorizontalPanel()` to collapse whichever panel is currently the active bottom panel by setting its height to `0px`, `minHeight: 0px`, `padding: 0px`, `margin: 0px` and hiding all its inner children except `#timelineCollapseBtn`.
4. **Symmetric Swapped Layout Support**:
   - When the user swaps spots in standard layout, the editor panel (`#recipePanelWrapper`) becomes the bottom panel in the left column, and the timeline controls go to the right-hand sidebar.
   - The collapse buttons dynamically adapt: clicking the horizontal collapse button collapses the editor panel (bottom left) and clicking the sidebar collapse button collapses the timeline controls (right column), perfectly aligning hide actions with visual placement.

### 🧪 Verification Results
Running the automated test suites verified that all panel collapse interactions, layout switching, column swapping, and scale transitions function perfectly:

| Test Script | Status | Description |
| :--- | :--- | :--- |
| `test_collapsible_panels.js` | **PASSED** ✅ | Asserts that side panel collapses/expands correctly, timeline collapses/expands correctly, handles stick to screen borders dynamically, and takes screenshots of all collapsed states (including swapped spots states). |
| `test_layout_swapping.js` | **PASSED** ✅ | Verifies presence of layout dropdown, clicks Switch Spots, asserts symmetrical panel relocation, and cycles through bottom layouts. |
| `test_symmetrical_swapping.js` | **PASSED** ✅ | Verifies that clicking Switch Spots in standard, bottom-controls, and bottom-editor layouts swaps column panels symmetrically while maintaining column visibility. |


---

## 🎨 Unified Light Blue Layout Buttons

### The Goal
Unify the styling of the panel swapping ("Switch Spots") and layout toggling ("Full Width" / "Column Layout") buttons across both the tab bar and above the timeline card, using a consistent light blue theme instead of white/grey default states.

### The Solution
1. **HTML Defaults updated**:
   - Modified `index.html` inline styles of `#swapPanelsBtn`, `#swapPanelsBtn2`, and `#playbackControlsLayoutBtn` to default to the light blue theme:
     - **Background**: `rgba(74, 144, 217, 0.04)`
     - **Border**: `rgba(74, 144, 217, 0.25)`
     - **Color**: `var(--text-body)` (a premium slate blue/grey)
2. **Dynamic Logic Sync**:
   - Updated the styling logic in `app.js`'s layout sync blocks to maintain the light blue theme:
     - **Inactive state**: Uses the same light blue background (`rgba(74, 144, 217, 0.04)`), slate blue text (`var(--text-body)`), and blue border (`rgba(74, 144, 217, 0.25)`).
     - **Active state**: Uses a solid light blue background (`var(--primary-light)`), medium blue text (`var(--primary)`), and a clean blue border (`rgba(74, 144, 217, 0.35)`) instead of the previous purple/indigo border.
3. **Cache Refresh**:
   - Bumped the application version and stylesheet link version parameters to `v=9.65` in both `index.html` and `mobile.html`.

### 🧪 Verification Results
Running the automated test suites verified that all button updates, layout swapping, and style transitions function perfectly:

| Test Script | Status | Description |
| :--- | :--- | :--- |
| `test_layout_behavior.js` | **PASSED** ✅ | Verifies correct layout switching states, tab selection changes, and DOM tree correctness. |
| `test_layout_swapping.js` | **PASSED** ✅ | Verifies presence of layout buttons, clicks Switch Spots, asserts symmetrical panel relocation, and cycles through bottom layouts. |

---

## ↔️ Horizontal Row Alignment & Equal Button Sizes

### The Goal
Keep the layout buttons on a single horizontal row even in narrow sidebar views (instead of wrapping and stacking vertically) and ensure the button pairs are exactly the same size.

### The Solution
1. **Fixed Horizontal Flex Row**:
   - Added CSS overrides for `#scrubberLayoutControls` and `#editorTabBar` inside all stylesheets (`styles.css`, `styles_v853.css`, `mobile.css`, and `mobile_v853.css`) with `display: flex !important; flex-direction: row !important; flex-wrap: nowrap !important;`.
   - This ensures that even when dynamic layout transitions in `app.js` toggle collapse states by resetting child displays (`child.style.display = ''`), the layout containers automatically preserve their flex-row flow, preventing vertical stacking.
2. **Identical Button Sizes**:
   - Set fixed width and centered alignment rules on the paired buttons in the stylesheets:
     - **Bottom Layout Buttons** (`#swapPanelsBtn2` and `#playbackControlsLayoutBtn`): overridden to `width: 120px !important; justify-content: center !important;`.
     - **Tab Bar Layout Buttons** (`#swapPanelsBtn` and `#editorFullWidthBtn`): overridden to `width: 130px !important; justify-content: center !important;`.
   - This guarantees that both buttons in each toolbar pair look perfectly symmetric and identical in size.
3. **Cache Busted**:
   - Bumped the query version parameter to `v=9.66` in `index.html` and `mobile.html` to load the new stylesheet rules immediately.

### 🧪 Verification Results
Executed the page layout verification suite to assert alignment:
- Verified that both `#scrubberLayoutControls` and `#editorTabBar` compute to `display: flex`.
- Verified that `#swapPanelsBtn2` and `#playbackControlsLayoutBtn` compute to exactly `120px` width.
- Verified that `#swapPanelsBtn` and `#editorFullWidthBtn` compute to exactly `130px` width.
