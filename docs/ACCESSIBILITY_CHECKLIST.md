# Accessibility verification checklist

The component suite runs `axe-core` against the active Card Lines game, and the Playwright suite audits the rendered dashboard, lobby, and board in desktop and mobile browser profiles. Both fail on detectable semantic violations. Automated checks still cannot establish real screen-reader output, high zoom behavior, color-vision usability, or touch comfort, so complete this checklist in both staging and production before calling the MVP accessible.

Record the browser, operating system, assistive technology, viewport, date, tester, and any issue link beside each test run. Do not mark an item complete from code inspection alone.

## Keyboard

- [ ] Starting at the address bar, use only `Tab`, `Shift+Tab`, `Enter`, `Space`, arrow keys, and `Escape` to set a display name, create a lobby, invite a player, assign teams, and start a game.
- [ ] Every interactive control receives an obvious focus indicator that is not clipped.
- [ ] After selecting a hand card, focus can reach a legal board target; arrow keys move one cell horizontally or vertically and stop at board edges.
- [ ] The move-confirmation controls can confirm or cancel without a pointer.
- [ ] The sequence-choice dialog moves focus inside the dialog, cycles focus within it, closes with `Escape`, and returns focus to **Confirm move**.
- [ ] Collapsible Players, Recent moves, and Quick rules panels work from the keyboard.
- [ ] No keyboard trap exists outside the intentional modal-dialog focus loop.

## Screen reader

- [ ] Test the production build with NVDA plus Firefox or Chrome on Windows; optionally repeat with VoiceOver plus Safari on an Apple device.
- [ ] Page headings and landmarks provide a useful navigation outline.
- [ ] Each card announces rank, full suit name, selected state, and Jack/dead-card behavior where relevant.
- [ ] The board announces a 10-row, 10-column grid; every cell includes row, column, printed card/free corner, occupancy, protection, and legal-target state.
- [ ] Turn changes, accepted moves, dead-card exchanges, passes, stale-tab refreshes, wins, and cancellations are announced once without moving focus unexpectedly.
- [ ] Team scores, current player, deck/discard counts, rules, and public move history are available as text outside the visual board.
- [ ] No opponent hand, replacement draw, or draw-deck order appears in the accessibility tree or network responses.

## Visual, zoom, and motion

- [ ] Run an automated contrast audit against the deployed page, then manually check text, focus rings, legal targets, disabled controls, all three teams, protected chips, and last-move outlines.
- [ ] At 200% browser zoom, content remains readable and operable without overlapping controls or lost text.
- [ ] At 400% zoom or a 320 CSS-pixel viewport, the board and hand scroll horizontally while their cells/cards remain operable.
- [ ] At 390×844 and 360×800 viewports, board cells remain at least 44×44 CSS pixels and the sticky status/hand controls do not conceal the selected cell or confirmation controls.
- [ ] Team, legal-target, protected-chip, current-turn, and winner information remains understandable in grayscale and with common color-vision simulations.
- [ ] With reduced motion enabled, the legal-target preview stops pulsing and no essential status depends on animation.

## Pointer and touch

- [ ] Complete one normal move, one two-eyed Jack placement, one one-eyed Jack removal, one dead-card exchange, and one sequence choice with touch input.
- [ ] Horizontal board scrolling does not accidentally play a cell.
- [ ] Sticky controls do not cover the board on desktop and can be dismissed or scrolled past on mobile.
- [ ] Destructive cancellation requires deliberate confirmation and is visually distinct from normal play.

## Completion record

- [ ] All critical/serious automated findings are fixed or documented with a reviewed technical justification.
- [ ] All manual checks above pass in staging.
- [ ] Any fixes are covered by an automated regression test where practical.
- [ ] The same smoke checks pass after promoting the reviewed commit to production.
