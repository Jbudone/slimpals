# Validation Protocol: UI/UX Audit

Run this protocol after implementation. It has four sections: DOM functional, Canvas/Phaser functional, UX quality, and visual regression. Each section applies to different parts of the app — read the issue's "What to build" to know which sections are relevant.

---

## Section A — DOM Functional (Tier 2 for non-canvas features)

For each walkthrough step:
1. Navigate to the entry-point URL.
2. Execute each user action (click, type, scroll, hover) exactly as specified.
3. After each action, screenshot and verify the expected outcome.
4. Read browser console after each interaction — zero new `console.error` or unhandled rejections.
5. Verify network requests match expected API endpoints and return 2xx.

**Fails if:**
- Required DOM element not found
- Click/type doesn't produce expected state change
- Route navigation doesn't reach expected URL
- Any `console.error` appears during the walkthrough
- API call returns non-2xx unexpectedly

---

## Section B — Canvas / Phaser Functional (Tier 2 for canvas features)

The gym is rendered in a Phaser 3 canvas (`<canvas>` inside `PhaserGym.svelte`). DOM inspection tools don't apply here.

### Screenshot comparison
Take a full screenshot of the canvas at the start of each test scenario. Compare before/after implementation to verify the change appears correctly and nothing around it regressed.

### Click-at-coordinate testing
Canvas interactions require clicking at specific pixel coordinates, not CSS selectors. For each canvas interaction step:
1. Note the expected screen coordinates (or describe the target: "the NPC in the center of the gym floor").
2. Click at those coordinates using browser automation, or manually and screenshot the result.
3. Verify the expected Phaser response: scene state change, dialog appearing, animation triggering.

### Phaser scene state inspection
Access Phaser scene state via browser console to verify internal state, not just visual appearance:
```javascript
// Get the active scene
window.game?.scene?.getScene('GymScene')
// Check NPC relationship state, event flags, day/night cycle, etc.
```
Verify state values match what the feature is supposed to set.

### NPC dialog flows
For any feature touching NPC interactions (`NpcDialog.svelte`, `NpcSprite.ts`):
1. Click the NPC at canvas coordinates.
2. Verify the dialog panel appears (DOM overlay or canvas draw).
3. Click each dialog option in sequence.
4. Verify the response updates correctly.
5. Verify NPC memory/relationship state updated (check via Phaser scene state or API call).

### Scene transitions
For features that trigger scene changes (e.g., entering/exiting gym, day/night transitions):
1. Trigger the transition.
2. Verify the loading/transition animation plays.
3. Verify the new scene loads without canvas errors (check browser console).
4. Verify scene state is correct after transition.

### Canvas-specific failure criteria
- Canvas renders a blank/black area when it shouldn't
- Click events at the canvas coordinates don't trigger expected behavior
- Phaser scene state doesn't match expected values after interaction
- Console shows Phaser errors (scene not found, asset load failure, etc.)
- Animation or sprite fails to render (visible as missing asset or frozen frame)

---

## Section C — UX Quality Audit

Run this for all features, DOM and canvas. These questions catch problems that visual inspection misses.

### Discoverability
- Can a user find this feature without being told where it is?
- Is the entry point visible from relevant context (e.g., gym floor, dashboard, menu)?
- If it's hidden behind a gesture or rare condition, is there any affordance?

### Feedback latency
- Does the UI respond within ~100ms of any user action? (Button presses, clicks, taps)
- Is there a loading indicator for any async operation that takes >300ms?
- For Phaser canvas: does the NPC/object respond immediately to click, even if the full animation takes longer?

### Error state clarity
- When something fails (network error, validation error, forbidden action), does the message explain what happened AND what the user can do?
- Error messages should not be raw codes or "Something went wrong" with no follow-up.

### Reversibility
- Can the user undo or go back from any destructive action?
- If not reversible, is there a confirmation step?

### Edge & empty states
- What does the UI show when there's no data yet? (Empty gym, no badges, no checkins)
- Is the empty state informative rather than just blank?

### Mobile usability (for DOM UI)
- All tap targets at least 44×44px
- No content hidden behind fixed headers/footers on small screens
- Forms don't get obscured by the mobile keyboard

---

## Section D — Visual Regression (Tier 3)

### DOM component checks
For each component in the regression list:
1. Screenshot at desktop (1280px), tablet (768px), mobile (375px).
2. **Overlap**: No text bounding box overlaps another text node.
3. **Overflow**: No element extends beyond its parent container.
4. **Alignment**: Flex/grid children within 2px of their expected axis.
5. No horizontal scrollbar at any breakpoint (unless intentional).
6. Navigation elements visible and reachable at all breakpoints.

### Interactive state checks (DOM)
- **Hover**: visible state change (cursor, color, shadow)
- **Focus**: visible focus ring (keyboard navigability)
- **Disabled**: visually distinct from enabled
- **Loading**: spinner/skeleton visible during async ops

### Canvas visual checks
- Screenshot the canvas at idle state — compare to pre-change baseline.
- Verify sprite z-ordering is correct (NPCs not drawing under floors, UI not under sprites).
- Verify text rendering within canvas (NPC names, UI labels) is readable and not clipped.
- Verify day/night cycle lighting doesn't clip or artifact at transition boundaries.

### Regression hotspot cross-reference
For each entry in `regression_hotspots` in `project_state.json`:
- Screenshot the area.
- Confirm no visual regression.
- If no baseline exists, note it and take one now.

---

## Admin Panel Verification

If the issue's cross-system notes say admin panel is affected:
1. Log in as an admin user.
2. Navigate to `http://localhost:5173` → Admin page.
3. Verify the new entity/state/badge is visible and manageable.
4. Verify admin actions (create, edit, grant, revoke) work correctly.
5. Verify non-admin users can't access the admin-only endpoints.

---

## Validation Report Format

Write to `.agent/issues/<issue-id>-validation.md`:

```markdown
# Validation Report: <Issue Title>

**Date:** <ISO timestamp>
**Canvas involved:** yes / no
**Admin panel affected:** yes / no

## Section A — DOM Functional
- Step 1: PASS / FAIL / SKIP — <details>

## Section B — Canvas Functional  
- NPC click at (x,y): PASS / FAIL / SKIP — <details>
- Scene state after interaction: PASS / FAIL / SKIP
- Console errors: none / <list>

## Section C — UX Quality
- Discoverability: PASS / NEEDS WORK — <note>
- Feedback latency: PASS / NEEDS WORK
- Error clarity: PASS / NEEDS WORK
- Reversibility: PASS / N/A

## Section D — Visual Regression
- Desktop (1280px): PASS / FAIL
- Tablet (768px): PASS / FAIL
- Mobile (375px): PASS / FAIL
- Canvas baseline: PASS / FAIL / BASELINE_MISSING

## Admin Panel
- Admin verification: PASS / FAIL / N/A

## Overall: PASS / FAIL
**Blocking issues:** <list any FAILs that must be fixed before merge>
**Non-blocking notes:** <list NEEDS WORK items for follow-up>
```

**Overall is PASS only if zero blocking FAILs. UX "NEEDS WORK" items are non-blocking but must be logged.**
