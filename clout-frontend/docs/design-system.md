# public — design.md

## Brief
Redesign Clout dashboard: ruthless Apple-like clarity, one dominant action, premium Arc-only glass surfaces, live functionality preserved.

## Reference Notes
- **Apple system surfaces:** clarity comes from a single hierarchy. One hero action, quiet secondary controls, generous negative space, and a strong material layer rather than stacked decoration.
- **Awwwards, Algorithmic Trading Dashboard:** a focused operating surface works better than a grid of equal cards. Borrow the intentional dashboard frame, not the dense trading-terminal behaviour.
- **Awwwards, NexBank:** two-color restraint creates confidence. Clout keeps the sampled Arc navy, steel, and silver palette only.
- **Layers, Social Network Home Screen:** social products succeed when the feed is visually subordinate to the immediate user intent. The composer becomes the primary action, not a utility box.
- **Layers, Orbit SaaS Dashboard:** use a stable navigation rail and one wide focal area. Remove decorative widgets that do not change a decision.
- **Landbook:** clean hierarchy and whitespace are consistently stronger than feature-heavy crypto dashboards. Avoid generic glow overload and fake market theatre.

## Product Feel
Calm, architectural, precise. A social layer that feels as trustworthy as a payments app.

## Audience
Arc users who want to see their identity, activity, and the next action without parsing a terminal.

## Accent Color
Arc steel blue `#5C8FB8`, with metallic silver `#DEE8EA` strictly for hierarchy and highlight.

## Typography
Inter for interface, IBM Plex Mono for network and balance data, Michroma only for the Clout wordmark.

## Copy Voice
Confident, terse, active. The dashboard speaks in outcomes: "Share an update", "Your Arc balance", "Nothing new yet".

## User Flow
Landing → connect wallet → Home dashboard → share an update or move through focused destinations.

## Screens to Build (in order)
- [x] Home dashboard, dominant identity and compose moment
- [x] Existing focused destinations, navigation preserved
- [x] Responsive desktop, tablet, and mobile composition

## States to Cover Per Screen
- [ ] Default / loaded
- [ ] Loading / skeleton
- [ ] Empty state
- [ ] Error state
- [ ] Success / confirmation
- [ ] Mobile (375px)
- [ ] Tablet (768px)
- [ ] Desktop (1280px+)

## Accessibility Checklist
- [ ] Focus-visible rings on all interactive elements
- [ ] Color contrast ≥ 4.5:1 for body text
- [ ] Reduced-motion guard in CSS
- [ ] Semantic HTML
- [ ] aria-label on icon-only buttons
- [ ] Form inputs have labels

## Consistency Rules
- [ ] No raw hex values in markup
- [ ] Same button variant for same action type
- [ ] Nav identical across all screens
- [ ] No orphan font sizes
