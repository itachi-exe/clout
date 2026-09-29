# clout — design.md

## Brief
Clout presentation quality pass: preserve Arc navy, steel, and silver while improving semantic controls, mobile first-use clarity, and feed composition.

## Reference Notes

### Responsive density pass, 2026-09-22

1. **Apple HIG and mobile usability references**: Keep real tap targets at least 44px while reducing non-interactive visual mass. Clout keeps its 62px bottom navigation and reduces only card padding, type scale, and empty vertical space.
2. **Awwwards mobile apps**: Mobile parity means preserving the useful task, not preserving desktop proportions. Clout retains wallet identity, composition, and feed access without a desktop-sized welcome panel.
3. **Landbook, DeNites and Nimi social-Web3 references**: Community products lead with one obvious destination. Clout makes Home, identity, and posting visible without competing decorative blocks.
4. **Lapa Ninja social feed resources**: Minimal feed patterns let content, not framing, own the screen. Clout reduces the composer from a second hero to a compact creation control.
5. **Layers social-app collections**: Dark-mode dashboards work when surface depth is quiet and information density remains useful. Clout keeps the Arc glass language but compresses interior spacing on phones.
6. **Dribbble social network and analytics collections**: Strong mobile social UI uses a readable title scale, one clear action, and a bottom navigation that is easy to tap. Clout applies this without copying the generic bright-card aesthetic.

**Responsive decision**: At 320 to 430px, the dashboard intro and composer should read as a compact orientation and creation layer, not two stacked landing-page sections. Maintain 16px composer input text and the full bottom-nav touch area.

**Canvas decision, superseded 2026-09-22**: The supplied legacy reference won the preference test. The page canvas becomes deep midnight blue `#061126`, not black. Arc navy carries the space, steel blue establishes depth, and silver is reserved for primary completion. Every major panel uses a restrained translucent navy layer, one hairline highlight, and a 20px frost blur. The result should read as a coherent material environment, never a neon glassmorphism demo.

### Legacy reference refinement, 2026-09-22

1. **Supplied Clout legacy desktop**: Retain the 3 column navigation, social feed, and contextual right rail. Its strength is calm hierarchy, practical density, and one visually obvious feed spine.
2. **Farcaster social clients**: Preserve immediate social actions and let the wallet be infrastructure, not the visual subject.
3. **Linear**: Use sparse page framing and clear active navigation to make dense product surfaces feel composed.
4. **Apple Liquid Glass guidance**: Glass must be a material cue, not a filter. Use blur for separation, preserve contrast, and keep interaction states readable.
5. **Dribbble NFT Dashboard Design**: The three column social-plus-market pattern is table stakes, but Clout differentiates through quiet settlement context rather than lots of colorful widgets.
6. **Dribbble DeFi Wallet Dashboard**: Use blue depth and a single trust accent. Avoid secondary rainbow colors and ornamental KPI tiles.

**Desktop treatment**: `#061126` canvas, subtle center-top steel illumination, `rgba(10,30,62,.58)` panels, `rgba(176,208,234,.14)` borders, 20px blur, and minimal inset silver highlights. The hero becomes a calm glass orientation surface. The rail and right panels become secondary glass strata. The feed stays materially open and easy to scan.

### Adaptive shell, 2026-09-22

1. **Wide desktop, 1220px and up**: Keep the three-column composition, but let the feed absorb available space up to a 1520px shell. The feed is the product, so extra room belongs there rather than becoming empty margins.
2. **Laptop, 1150px to 1219px**: Retain the right context rail but reduce the left rail to icons. Navigation remains present without compressing the feed.
3. **Compact desktop, 900px to 1149px**: Remove the right rail before it forces the feed below a comfortable reading width. Keep a labelled left rail for orientation.
4. **Tablet, 769px to 899px**: Keep only a slim icon rail and a fluid feed. No horizontal clipping is acceptable.
5. **Phone, 768px and below**: Preserve the existing bottom navigation and single-column feed.

**Responsive decision**: A secondary rail is progressive enhancement, never a condition for a usable feed. Shell columns use flexible `minmax(0, 1fr)` tracks and each breakpoint is audited at 1920, 1366, 1024, 900, 768, and 375px.

1. **Linear**: A composed zero state explains the state, then makes the next action unmistakable. Its project views avoid feature tours and use one visible creation path. Clout should treat an unconnected wallet as an identity state, not an error.
2. **Slack**: New channels explain their purpose before content exists. The useful lesson is context before action, not a decorative welcome panel. Clout’s feed should tell a new member what sharing on Arc means, then let them act.
3. **Gmail**: “All caught up” makes a zero inbox feel completed rather than missing. Notifications need a resolved state distinct from an unconnected and a failed state.
4. **Figma**: First-use screens turn a blank canvas into a focused creation prompt, with choices only where they speed the first action. Clout’s composer should offer a clear readiness signal instead of a pile of tools.
5. **Warpcast / Farcaster**: The core interaction is immediate posting and social feedback, while the crypto identity stays quietly underneath. Clout should preserve its social-first feed and keep settlement data as supporting context.
6. **Wise**: Trust flows explain what will happen before a consent step. Wallet connection should say that it connects identity and reads Arc USDC balance, while the signature remains explicit and non-financial.
7. **Circle**: Community value is expressed through the next useful action, not competing framework controls. Clout should keep a single identity entry point beside current network context.
8. **Geckoboard**: High-signal dashboards use a sparse initial layer and defer detail. Clout should keep feed context readable before the composer.
9. **Path Social**: A clear community label plus an obvious active destination reduces new-user orientation cost. Clout retains a visible Home state without adding an onboarding tour.
10. **Blockchain dashboard collections**: Crypto interfaces commonly overfill early surfaces with metrics. Clout differentiates by making settlement context quiet and letting social activity be the product.

**Differentiation**: A quiet social terminal for stablecoin settlement. No token theatre, no invented urgency. Clout leads with a user’s identity and one meaningful move, then lets the network prove itself.

**Current feed references, 2026-09-22**

1. **Threads**: A 540px content-first stream works because the timeline itself is the pitch. Keep the primary view as the feed, with quiet identity support at the edge.
2. **Warpcast / Farcaster**: Social interactions stay immediate while chain mechanics sit beneath the experience. Clout should retain the same priority, post first, settlement context second.
3. **Lens**: Portable identity and social graphs are useful only when their mechanics are not the first thing a member has to decode. Avoid protocol jargon in the composer.
4. **Linear**: Composed empty and first-use states provide a single obvious next move. The composer should state the identity requirement once, in its input, rather than add a second explanatory card.
5. **Wise**: Consent experiences earn trust by being explicit and terse. “Connect to make it permanent” is clear about the boundary without turning a draft into a blocked form.

**Feed decision**: Present exactly ten posts at a time. When live network posts exist, they lead the feed and replace an equal number of curated seed posts, so the scrollable surface stays tangible without obscuring real activity.

### Profile identity, 2026-09-22

1. **Farcaster / Warpcast onboarding**: A wallet-linked social product needs a human identity before its first public post. Clout opens one concise profile sheet after first verification, not a multi-step tour.
2. **Social avatar conventions**: A square source must survive a circular crop. The client center-crops and compresses locally to a 256px WebP before upload, so the user sees exactly what will render.
3. **Identity safety**: Usernames normalize to lowercase and are unique case-insensitively. The API accepts only verified PNG, JPEG, or WebP signatures under 128KB, then stores the compact output with the wallet-bound profile.

**Profile decision**: The connected wallet button becomes the profile entry point. A username and avatar appear in the composer immediately, then travel with every live feed post and leaderboard row. There is no separate profile page yet because setting identity is the only job here.

## Product Feel
Calm, precise, and materially deep. Premium dark Arc navy surfaces with steel and silver as the sole expressive palette. Motion confirms intent, it never decorates.

## Audience
Arc Testnet builders, social traders, and early stablecoin-native community members.

## Accent Color
Arc steel `#3A6689`, with silver `#DEE8EA` reserved for primary completion states. No secondary accent palette.

## Typography
Inter for interface and display. IBM Plex Mono for addresses, balances, and protocol facts. Tight display tracking, tabular figures.

## Copy Voice
Confident, terse, active. Explain the value of a state, then offer exactly one action. “Write the first signal.”, not “No posts available.”

## User Flow
Landing → connect wallet → sign a non-financial verification → identity is ready → write first update → persistent feed activity → notifications and wallet context.

## Screens to Build (in order)
- [x] Home and first-use / connected readiness
- [x] Search, notifications, and wallet zero states
- [x] Shared feedback and mobile interaction layer

## States to Cover Per Screen
- [x] Default / loaded
- [x] Loading / skeleton
- [x] Empty state
- [x] Error state
- [x] Success / confirmation
- [x] Mobile (375px)
- [x] Tablet (768px)
- [x] Desktop (1280px+)

## Accessibility Checklist
- [x] Focus-visible rings on all interactive elements
- [x] Color contrast reviewed for body text
- [x] Reduced-motion guard in CSS
- [x] Semantic HTML
- [x] aria-label on icon-only buttons
- [x] Form inputs have labels

## Consistency Rules
- [x] No raw hex values in markup except existing SVG assets
- [x] Same button variant for same action type
- [x] Nav identical across all screens
- [x] No orphan font sizes
