# Vaultor UI Philosophy

> **Status:** Product design contract  
> **Scope:** All Vaultor user interfaces — desktop, browser-hosted UI, and any companion surfaces where these principles apply  
> **Primary goal:** Make Vaultor feel spatially intelligent, dense without being cramped, calm without being static, and animated in ways that make the interface feel alive.

---

## 1. Why this document exists

Vaultor already has a visual identity. The purpose of this document is **not** to redesign the product into a different aesthetic.

The problem this document addresses is interaction quality:

- too much vertical space is often consumed by chrome, padding, headers, controls, or repeated framing;
- important controls can disappear simply because content scrolls;
- straightforward fixes such as sticky headers, nested scroll containers, permanently floating toolbars, or extra cards often solve the functional problem while making the interface feel heavier;
- animation exists, but often as decoration rather than as part of the interface's structure;
- different screens can independently arrive at different interaction patterns, creating a product that looks related but does not feel like one coherent system.

Vaultor should not merely have animations.

**Vaultor should use motion, space, and transformation as part of how the interface works.**

The interface should feel as though it understands where the user's attention is and reorganizes itself accordingly.

---

# 2. The core idea

## Do not pin the existing UI. Transform it.

When important interface elements would normally leave the viewport, Vaultor should first ask:

> Can this interface progressively transform into a more compact state instead of simply becoming sticky, fixed, duplicated, or separately scrollable?

This is one of the most important rules in the product.

A large header can become a compact header.

A labeled action can become an icon.

Metadata can fade or collapse.

A title can reduce in scale and migrate into a smaller navigation surface.

A preview can expand into a larger viewing mode.

A sidebar can compress rather than simply disappear.

A toolbar can reorganize around the user's current task.

The user should be able to visually understand that the compact state came from the expanded state.

**The same interface is changing form. It is not being replaced by another interface.**

---

# 3. Vaultor should feel like this

Vaultor should feel:

- fluid;
- spatial;
- deliberate;
- calm;
- responsive;
- tactile;
- dense without feeling crowded;
- minimal without feeling empty;
- fast without feeling abrupt;
- animated without feeling theatrical;
- powerful without looking like an enterprise admin dashboard;
- slightly playful in moments where motion can create delight;
- coherent across every screen.

Vaultor should avoid feeling:

- card-heavy;
- dashboard-like;
- floaty;
- excessively padded;
- visually fragmented;
- glassmorphic for its own sake;
- bouncy;
- flashy;
- mechanically sticky;
- full of nested boxes;
- full of nested scrolling areas;
- like each screen was independently designed by a different person.

---

# 4. Vertical space is expensive

Vaultor is an information-dense knowledge application. Vertical space must be treated as a valuable resource.

Large empty areas are allowed when they create meaningful hierarchy, orientation, focus, or calm. They are not allowed simply because default component spacing happens to be large.

Every screen should be reviewed for:

- oversized title regions;
- duplicated labels;
- excessive top and bottom padding;
- controls placed on separate rows when they can share a hierarchy;
- cards nested inside cards;
- repeated section headers;
- unnecessarily tall buttons;
- toolbars that reserve space even when their controls are secondary;
- metadata that consumes permanent height despite being useful only during orientation;
- headers whose expanded layout remains unchanged after the user has begun interacting with the content.

### General rule

**The top of a screen may be spacious enough to establish context. Once the user begins working, the UI should become more efficient.**

This creates a natural relationship between orientation and productivity:

1. enter a screen;
2. understand where you are;
3. begin interacting;
4. the interface becomes denser around the task.

---

# 5. Progressive compression

Progressive compression is a first-class Vaultor interaction pattern.

A screen can have multiple density states without feeling like multiple screens.

For example, a collection page may begin with:

- collection title;
- description or metadata;
- resource count;
- primary actions;
- sorting/filter controls;
- view controls;
- resource content.

As the user scrolls, the interface may gradually transform:

- the title becomes smaller;
- secondary metadata fades or collapses;
- padding contracts;
- important actions migrate toward the top control region;
- textual buttons may simplify into recognizable icons;
- secondary actions may move into an overflow menu;
- the content area reclaims the space;
- essential context remains visible.

When the user scrolls upward, the transformation reverses naturally.

### Progressive compression should usually be:

- continuous where practical;
- driven by interaction progress rather than a single abrupt threshold;
- reversible;
- spatially understandable;
- subtle enough that it never fights scrolling;
- efficient enough that it does not cause layout jank.

### Progressive compression is preferred over:

- adding a second scrollbar;
- making the entire original header sticky;
- duplicating the header;
- introducing a permanent floating toolbar;
- keeping large controls permanently visible;
- snapping between two visually unrelated header implementations.

---

# 6. Spatial continuity

Motion should explain where things came from and where they went.

This principle applies everywhere in Vaultor.

When an element changes state, ask:

> What is the user's mental model of this object?

If the object is still conceptually the same object, the UI should preserve that identity visually where practical.

Examples:

- A resource opened from a list should feel connected to the resource that was selected.
- A preview becoming larger should feel like the preview surface expanded, not like an unrelated page appeared.
- A collapsed sidebar should visually compress from the expanded sidebar.
- A toolbar changing density should reorganize rather than vanish and respawn.
- A collection title becoming compact should visibly settle into its compact location.
- A pane entering focus mode should feel like the existing pane claimed more space.
- Returning from a focused state should restore the previous spatial arrangement naturally.

### Motion must not lie about object identity

If two surfaces are conceptually unrelated, do not force a morph between them.

If two states represent the same underlying object, avoid treating them as unrelated pages when a continuous transition would better communicate the relationship.

---

# 7. Motion is structural, not decorative

Animation in Vaultor has four jobs:

1. **Explain cause and effect.**  
   The user should understand what their action changed.

2. **Preserve spatial continuity.**  
   The interface should show where elements move, collapse, expand, or reorganize.

3. **Direct attention.**  
   Motion can guide the eye toward the result of an action without demanding attention for itself.

4. **Create delight through elegance.**  
   A transformation can feel magical because it is unexpectedly smooth and obvious in hindsight.

Animation should not exist merely because a component can be animated.

### Good Vaultor motion

- a control smoothly moving into a compact state;
- a surface expanding from the region that triggered it;
- a sidebar compressing while its content hierarchy reorganizes;
- a collection header progressively collapsing as content becomes the focus;
- a pane smoothly claiming available space;
- contextual controls appearing from the area they belong to;
- a theme transition that visually transforms the application rather than instantly recoloring it.

### Bad Vaultor motion

- random fades;
- every component sliding in on mount;
- arbitrary scaling on hover;
- excessive spring/bounce effects;
- long entrance animations that delay work;
- animation attached to every state change;
- motion that makes elements appear to come from the wrong place;
- simultaneous animation of too many unrelated regions;
- `transition-all` used without understanding what should actually animate.

---

# 8. The Vaultor motion character

Vaultor motion should feel:

- quick;
- smooth;
- confident;
- slightly soft at the end;
- physically coherent;
- interruptible where possible;
- reversible;
- never sluggish.

The product should generally avoid exaggerated bounce.

Springs may be used when they make spatial movement feel natural, but they should be tightly controlled. Vaultor should feel refined rather than toy-like.

### Timing guidance

These are starting points, not rigid constants:

- micro feedback: roughly 100–180 ms;
- small control/state transitions: roughly 160–240 ms;
- layout transformations: roughly 220–380 ms;
- major spatial transitions: roughly 280–450 ms.

A longer duration is justified only when the motion communicates a larger spatial change.

### Easing guidance

Prefer easing that feels fast to respond and gentle when settling.

Avoid:

- slow starts after user input;
- overshoot unless the motion genuinely benefits from it;
- different arbitrary easing curves across every feature.

Vaultor should eventually centralize motion tokens just as it centralizes color and spacing tokens.

---

# 9. Scroll is an interaction signal

Scrolling is not merely movement through content.

It tells the interface where the user's attention has shifted.

At the beginning of a page, the user often needs context.

After scrolling into content, the user usually needs:

- the content itself;
- essential actions;
- enough orientation to know where they are.

Therefore Vaultor may use scroll position and scroll direction to transform surrounding UI.

Examples:

- expanded header → compact working header;
- full metadata → minimal context;
- labeled actions → compact controls;
- large filters → condensed filter summary;
- navigation chrome → reduced navigation chrome;
- secondary controls → temporarily hidden or grouped.

### Scroll transformations must not:

- fight the user's scroll;
- cause visible jumps in content position;
- repeatedly open and close due to tiny scroll movements;
- produce layout instability;
- hide critical actions without a clear replacement;
- make the user chase moving controls.

Hysteresis or sensible thresholds may be used to prevent jitter.

---

# 10. Avoid nested scrolling by default

Additional scroll containers are a last resort.

A screen should normally have one obvious primary scroll context.

Nested scrolling can be appropriate for genuinely independent content regions, but it should not be introduced merely to keep controls visible.

Before adding an internal scrollbar, ask whether:

- the controls can compress;
- the surrounding layout can transform;
- secondary chrome can disappear;
- controls can migrate;
- the page structure can be simplified.

A technically easy nested scroll solution is not automatically a good Vaultor solution.

---

# 11. Persistent controls should earn permanence

A control should not remain permanently visible simply because it might be needed later.

Classify controls as:

### Essential persistent
Frequently needed during the current task and costly to lose.

### Contextual
Needed in a specific state or selection.

### Orientation
Useful when entering a screen but not continuously.

### Secondary
Occasionally useful and appropriate for an overflow or command surface.

The layout should respond accordingly.

An orientation control may disappear after the user begins working.

A contextual control may appear near the affected content.

A persistent control may compress into a smaller form.

A secondary action may move into overflow.

This allows Vaultor to remain powerful without permanently displaying its entire capability set.

---

# 12. Information density

Dense does not mean cramped.

Vaultor should use hierarchy rather than empty space to create clarity.

Use:

- typography;
- alignment;
- grouping;
- subtle separation;
- contrast;
- rhythm;
- progressive disclosure;
- motion;
- contextual controls.

Do not automatically use:

- giant gaps;
- cards around every concept;
- separators between every row;
- oversized labels;
- multiple layers of bordered containers.

### Density should adapt to context

A browsing screen may be moderately spacious.

A long resource list should become more efficient.

An editor should maximize usable content area.

A settings page may use stronger grouping.

A focused preview should prioritize the resource over surrounding chrome.

---

# 13. Surface hierarchy

Not everything deserves a card.

Vaultor should prefer a small number of meaningful surfaces rather than many nested ones.

Use elevated/bordered surfaces when they communicate:

- containment;
- temporary focus;
- modal context;
- preview context;
- separation between independently meaningful regions.

Avoid adding containers solely to make a layout look "designed."

The default should be **content on a coherent application surface**, not content inside endless cards.

---

# 14. Context should survive navigation

Vaultor is a workspace.

Navigation should preserve a sense of place.

Where technically reasonable:

- returning to a list should preserve scroll position;
- returning to a workspace should preserve relevant pane state;
- opening and closing previews should not arbitrarily reset surrounding context;
- focus changes should preserve the user's previous arrangement;
- transformed headers should return to the correct state based on scroll position;
- filters and selection should not reset without a reason.

Animation should reinforce this continuity.

---

# 15. Theme changes are transitions, not recolors

Changing theme is a global visual transformation and should feel intentional.

Vaultor must not treat theme switching as:

> update variables → entire application instantly flashes into new colors.

A theme change should feel like the interface transforms from one visual environment into another.

### Preferred behavior

Where the platform and browser support it well, theme switching should use a coordinated transition.

A strong Vaultor pattern is a **theme reveal**:

- the transition originates near the theme control or another logically meaningful origin;
- the new theme expands or reveals itself across the application;
- surfaces, text, borders, backgrounds, and chrome change as one coherent visual event;
- the transition is brief and elegant;
- content geometry should remain stable.

Possible implementation strategies include:

- the View Transitions API when appropriate;
- a controlled overlay/reveal transition;
- coordinated CSS custom-property interpolation where it behaves reliably;
- graceful fallback to a simpler fade when advanced transitions are unavailable.

### Avoid

- individually animating dozens of components with unrelated timing;
- slow color tweening that makes text temporarily low-contrast;
- theme changes that trigger layout movement;
- full-screen flashes;
- excessive gimmicks;
- transitions that delay interaction.

### Reduced motion

When the user prefers reduced motion, theme switching should remain polished but use minimal motion, such as a very short crossfade or immediate accessible transition.

---

# 16. Theme transition concept

The preferred conceptual model is:

**The new theme enters the workspace.**

For example, if the user presses a theme button in Settings or the application chrome, the new theme may reveal outward from that interaction point.

This gives the transformation a cause.

The user clicked there, so the visual change begins there.

The exact visual technique may evolve, but the principle should remain:

**global transformations should have a spatial origin whenever that improves comprehension and delight.**

---

# 17. Lists and collections

Long lists are central to Vaultor and should be treated carefully.

A list screen should prioritize:

- resource identification;
- scanability;
- selection;
- sorting/filter state;
- navigation;
- quick actions;
- continuity while scrolling.

Headers above long lists should usually be candidates for progressive compression.

Avoid permanently reserving large areas above a long list.

Avoid solving every long-list problem with an independently scrollable panel.

### Collection detail example

Expanded state:

- prominent collection title;
- useful collection metadata;
- primary actions;
- filtering/sorting controls;
- resource list.

As the user scrolls:

- title scales down and migrates toward the compact header position;
- secondary metadata fades/collapses;
- vertical padding contracts;
- essential collection actions migrate into a compact control row;
- labeled actions may become icons when their meaning remains clear;
- filters may condense;
- resource content naturally takes over the viewport.

Reverse the transformation as the user returns upward.

This pattern should inspire similar behavior elsewhere, but should not be mechanically copied when the screen has different needs.

---

# 18. Panes and previews

Vaultor's multi-pane and preview experiences are inherently spatial.

Treat them that way.

Opening, resizing, focusing, minimizing, or closing a pane should preserve the sense that it is the same surface moving through different states.

Good behavior may include:

- expansion from the previous bounds;
- neighboring content yielding space smoothly;
- chrome simplifying as a pane becomes focused;
- preview controls reorganizing based on available width;
- restoring prior geometry when leaving focus.

Avoid treating every pane-state change as a route change with an unrelated entrance animation.

---

# 19. Menus, command surfaces, and contextual UI

Menus should appear to belong to the control or content that invoked them.

Contextual surfaces should have a clear spatial relationship to their trigger.

Animations should be small and fast.

The command palette is allowed to feel more prominent because it is a global mode, but it should still emerge cleanly and disappear without leaving visual residue.

Avoid dramatic animation for short-lived utility surfaces.

---

# 20. Empty states

Empty states should be compact and useful.

Do not fill large areas merely because there is no content.

An empty state should:

- explain what belongs here;
- offer the most likely next action;
- optionally teach one useful capability;
- remain visually calm.

Animation can add subtle life, but should not turn empty states into illustrations that dominate the product.

---

# 21. Settings

Settings are especially vulnerable to vertical waste.

Prefer:

- clear grouped sections;
- compact rows;
- inline descriptions where readable;
- controls aligned consistently;
- progressive disclosure for advanced options.

Avoid:

- one giant card per setting;
- enormous section gaps;
- excessive headings;
- repeating obvious descriptions.

Settings should feel sophisticated and efficient, not sparse for the sake of looking premium.

---

# 22. Responsive adaptation

Responsive behavior should reorganize hierarchy, not merely stack everything vertically.

When space decreases:

- secondary labels may disappear;
- controls may compact;
- groups may move into overflow;
- panes may change presentation;
- information may progressively disclose.

Do not treat mobile/narrow layouts as desktop components stacked into a single column without reconsidering hierarchy.

---

# 23. Animation performance is part of design

A beautiful transition that drops frames is not beautiful.

Prefer animation techniques that avoid expensive repeated layout work.

Where practical:

- animate transforms and opacity;
- minimize forced synchronous layout;
- avoid continuously measuring many elements during scroll;
- use requestAnimationFrame or framework-appropriate motion primitives for scroll-linked work;
- keep DOM complexity in mind;
- test with realistic large Vaultor datasets.

Do not sacrifice correctness or maintainability for an unnecessarily elaborate effect.

The goal is **high-quality motion**, not maximum animation complexity.

---

# 24. Accessibility and reduced motion

Motion must never be required to understand or operate Vaultor.

Respect `prefers-reduced-motion`.

Reduced-motion mode should:

- remove large spatial sweeps;
- minimize parallax-like behavior;
- shorten or eliminate nonessential transitions;
- preserve state clarity;
- retain polished immediate feedback.

No important control may exist only during an animation.

No state may become ambiguous when motion is disabled.

---

# 25. Animation must survive interruption

Where practical, UI transformations should behave correctly if the user:

- reverses scroll direction;
- clicks another control mid-transition;
- closes a surface before its opening animation finishes;
- rapidly switches panes;
- changes theme repeatedly;
- resizes the window.

Animations should represent application state.

Application state must never depend on an animation finishing successfully.

---

# 26. Consistency over novelty

Do not invent a new animation language for every screen.

Before introducing a new interaction pattern, ask whether it belongs to one of the established Vaultor patterns:

- progressive compression;
- surface expansion;
- spatial migration;
- contextual reveal;
- density transformation;
- focus expansion;
- global visual transition;
- compact utility appearance.

Novel motion is justified when the interaction itself is novel.

---

# 27. Anti-patterns

The following require explicit justification before implementation:

- nested scrolling;
- permanently sticky large headers;
- duplicated compact and expanded headers with abrupt swapping;
- permanent floating action bars;
- excessive cards;
- excessive vertical padding;
- `transition-all`;
- arbitrary fade-in on mount;
- arbitrary slide-in on mount;
- bouncing controls;
- animation delays after direct input;
- large layout shifts;
- hidden controls with no accessible compact equivalent;
- components independently choosing motion timings;
- theme changes that flash instantly;
- replacing spatial transformation with simple opacity whenever identity should be preserved;
- adding UI chrome instead of reorganizing existing UI.

---

# 28. A screen is not finished when it merely works

For every significant Vaultor screen, completion requires reviewing five layers:

### 1. Function
Does it work?

### 2. Hierarchy
Can the user immediately understand what matters?

### 3. Density
Is space being used intentionally?

### 4. Continuity
Do navigation and state changes preserve context?

### 5. Motion
Can transformations make the relationship between states clearer, smoother, or more delightful?

A screen that passes only the first layer is not a finished Vaultor screen.

---

# 29. Required AI workflow for UI work

AI agents working on Vaultor must not jump directly from a vague UI complaint into implementation.

For meaningful UI changes, follow this process.

## Phase A — Read

Before proposing or editing UI:

1. Read applicable sections for narrow fixes; read this file completely for substantial interaction redesigns.
2. Read the relevant current Vaultor documentation.
3. Inspect the actual current components and styles involved.
4. Understand existing state and interaction behavior.
5. Do not assume the screenshot or task description represents the entire implementation.

## Phase B — Audit

Before changing code, identify:

- wasted vertical or horizontal space;
- hierarchy problems;
- controls that are unnecessarily permanent;
- controls that disappear when they should transform;
- nested scrolling;
- unnecessary cards/surfaces;
- inconsistent spacing;
- inconsistent motion;
- opportunities for progressive compression;
- opportunities for spatial continuity;
- opportunities for meaningful animation;
- accessibility concerns;
- performance risks.

For substantial redesigns, **do not implement during this phase** unless explicitly instructed to do so.

## Phase C — Interaction specification

Describe the desired behavior in terms of states and transitions.

For each meaningful state change, specify:

- starting state;
- ending state;
- which elements remain conceptually the same objects;
- what moves;
- what resizes;
- what fades;
- what collapses;
- what becomes compact;
- what remains accessible;
- trigger;
- reversal behavior;
- reduced-motion behavior.

Do not reduce the specification to "make it sticky" or "add animation."

## Phase D — Implementation

Only after the desired interaction is clear:

- implement using the smallest coherent architecture;
- reuse motion/layout primitives where possible;
- avoid one-off animation logic;
- preserve current functionality;
- avoid layout jank;
- keep large datasets in mind;
- respect reduced-motion preferences;
- centralize reusable timing/easing values.

## Phase E — Review

After implementation, review the screen again against this document.

Ask:

- Did vertical efficiency improve?
- Did we add any unnecessary permanent chrome?
- Did we accidentally create nested scrolling?
- Does motion explain the transformation?
- Does the screen feel like Vaultor?
- Does the transition reverse cleanly?
- Does reduced motion remain usable?
- Did we introduce a one-off pattern that should be generalized?
- Is the result actually better than the simpler solution?

---

# 30. Mandatory instruction for AI agents

When an AI agent is asked to work on Vaultor UI, the following instruction should be treated as part of the task:

> Read applicable sections of `docs/design/UI_PHILOSOPHY.md` for narrow fixes, or the complete contract for substantial redesigns before making UI decisions. Treat it as the product's design contract, not optional inspiration. Preserve Vaultor's existing visual identity while applying its rules for density, progressive compression, spatial continuity, and structural motion. Do not default to sticky headers, nested scroll containers, floating toolbars, excessive cards, or arbitrary fade/slide animations when a spatial transformation can solve the problem more elegantly. For significant changes, first analyze the current screen and describe the interaction transformation before implementing it.

---

# 31. UI audit prompt

Use this when beginning work on an existing screen:

> Read applicable sections of `docs/design/UI_PHILOSOPHY.md` for narrow fixes, or the complete contract for substantial redesigns, then inspect the implementation of this screen and all directly related components/styles.
>
> Do **not** modify code yet.
>
> Audit the screen against the Vaultor UI philosophy. I want you to identify:
>
> - wasted vertical space;
> - unnecessary chrome;
> - hierarchy problems;
> - controls that consume permanent space without needing to;
> - controls that disappear during scrolling but should remain accessible through transformation;
> - nested scrolling or sticky/fixed behavior that could be replaced by progressive compression;
> - excessive cards, padding, or section framing;
> - places where spatial continuity is currently lost;
> - animations that are merely decorative;
> - places where structural animation could make the UI feel fluid and "magical";
> - inconsistent motion/spacing patterns;
> - accessibility or reduced-motion concerns;
> - performance risks.
>
> For every issue, explain what the user experiences now and what interaction model would better fit the manifesto.
>
> Prefer transformation of the existing interface over adding more UI.
>
> Do not propose generic "make it cleaner" changes. Be concrete about elements, states, movement, compression, and hierarchy.

---

# 32. UI implementation prompt

Use this after the audit and desired behavior have been agreed:

> Read `docs/design/UI_PHILOSOPHY.md` again before editing.
>
> Implement the agreed UI transformation exactly according to that design contract.
>
> Important:
>
> - preserve existing functionality unless the agreed design explicitly changes it;
> - reduce wasted vertical space;
> - prefer progressive compression and spatial transformation over sticky duplication;
> - avoid nested scroll containers unless genuinely necessary;
> - keep important controls accessible by reorganizing them rather than permanently reserving large areas;
> - animations must communicate state and spatial continuity;
> - elements representing the same conceptual object should visibly transform between states where practical;
> - avoid arbitrary fades, slides, bounce, `transition-all`, or unrelated animation;
> - use shared motion tokens/primitives rather than one-off timings where possible;
> - transitions must reverse cleanly;
> - respect `prefers-reduced-motion`;
> - avoid layout jank and test against realistic content sizes;
> - preserve Vaultor's current visual identity.
>
> After implementation, perform a self-review against every relevant section of `docs/design/UI_PHILOSOPHY.md` and report any compromise you had to make.

---

# 33. Whole-product UI transformation prompt

Use this when performing the larger Vaultor refinement pass:

> We are entering a dedicated Vaultor UI transformation phase.
>
> Read applicable sections of `docs/design/UI_PHILOSOPHY.md` for narrow fixes, or the complete contract for substantial redesigns and treat it as authoritative for all UI work.
>
> Do not begin by globally rewriting styles.
>
> First inventory the application's major user-facing screens and interaction surfaces. Group them by workflow and identify the screens with the highest problems in:
>
> - vertical space efficiency;
> - information density;
> - hierarchy;
> - scroll behavior;
> - permanent chrome;
> - spatial continuity;
> - motion quality;
> - consistency with other screens.
>
> Create a prioritized transformation plan.
>
> For each screen, define:
>
> 1. current problems;
> 2. desired density/hierarchy;
> 3. expanded state;
> 4. working/compact state if applicable;
> 5. scroll behavior;
> 6. which controls transform or migrate;
> 7. motion/transition model;
> 8. reduced-motion behavior;
> 9. reusable primitives that should be extracted;
> 10. risks to existing functionality.
>
> Do not implement the entire product at once.
>
> Refine one coherent surface/workflow at a time, while extracting shared primitives so later screens become easier to bring into the same language.
>
> The target is not "more animation."
>
> The target is an interface where motion, density, and spatial transformation are part of how Vaultor works.

---

# 34. Theme transformation prompt

Use this specifically when implementing theme switching:

> Read the theme and motion sections of `docs/design/UI_PHILOSOPHY.md`.
>
> Redesign Vaultor theme switching so it feels like a global visual transition rather than an instantaneous variable swap.
>
> The preferred interaction is a coordinated reveal of the new theme, ideally originating from the theme control or another meaningful interaction point.
>
> Explore the View Transitions API or an equally coherent implementation with graceful fallback.
>
> Requirements:
>
> - geometry must remain stable;
> - the transition should be brief, elegant, and interrupt-safe;
> - the application should transform as one visual system rather than dozens of unrelated component animations;
> - text contrast must remain valid throughout;
> - reduced-motion users should receive a minimal accessible transition;
> - unsupported environments must fall back cleanly;
> - theme switching must remain functionally immediate even if the visual transition is interrupted.
>
> Do not use a slow full-screen color tween or animate every component independently.
>
> Before implementation, describe the proposed visual transition and technical strategy.

---

# 35. Final principle

The highest-quality Vaultor interaction should create this reaction:

> "Of course it moved there."

The user should rarely notice an animation as an isolated effect.

They should notice that the application somehow stayed understandable, efficient, and beautiful while changing around them.

That is the standard.

**Vaultor should not merely display state. It should gracefully transform between states.**
