# Interface guide

Neighborhood is a local item sharing marketplace. The interface should feel warm, clear, and trustworthy. Discovery follows the patterns common to item marketplaces: a strong first image, search and location up front, visible price, and a compact item detail panel. The page uses an original editorial image, generous spacing, a green accent, and serif display headings.

## Sources of truth

- `apps/web/src/styles/tokens.css`: shared colors, radii, and motion durations.
- `apps/web/src/app/globals.css`: responsive layout and page patterns.
- `apps/web/src/components/ui/`: reusable controls and feedback.
- `apps/web/src/components/layout/`: site navigation and shared page layouts.

## Interaction

- Search and category choices update the URL, so filtered results can be shared.
- Filters stay collapsed until needed; active selections remain visible through selected category styling.
- Listing cards show category, location, and daily price or free lending without requiring a click.
- Buttons, cards, and image loading use short transitions. The opening hero has one subtle entrance animation.
- `prefers-reduced-motion: reduce` removes nonessential animation and smooth scrolling.
- Focus rings, associated labels, and semantic buttons and links remain visible for keyboard use.

## Responsive layout

- Desktop: eight category shortcuts, four listing columns, two column item details.
- Tablet: four category shortcuts, three listing columns.
- Mobile: compact navigation, stacked search controls, two listing columns, stacked item details.

## Exchange workflow patterns

- **Booking panel** (item page, inside the terms card): availability strip of the next
  three weeks (free / partly booked / booked / not bookable, with text labels, not
  colour alone), Riyadh-time pickers, live server quote with rental fee and refundable
  deposit on separate lines, and a visible **Simulated** tag. Owners see Manage
  availability instead. "Ask the owner" opens a listing conversation.
- **Workspace cards** (`.workspace-card`) group booking detail sections: next step,
  arrangements, condition records, timeline, Payments, agreed terms.
- **Next step** shows only the actions the API reports as available for the viewer
  (`availableCommands`), so no button leads to a refused action.
- **Status badges** (`BookingStatusBadge`) use the alert tones; every status also has a
  plain-language next-step sentence.
- **Payments** always carries the Simulated tag and a sentence that no real money moves.
- **Timeline** (`.timeline`) lists events with time (Riyadh) and actor.
- **Messages** use bubbles (`.bubble--mine`, `.bubble--theirs`), a composer that sends on
  Enter, and per-message retry when sending fails.
- **Notification bell** in the top bar shows an unread count (polled every 30 seconds
  while the tab is visible).
- Condition forms require an explicit OK or Problem per checklist line, and the
  borrower's acknowledgement has no default choice.

## Trust, community and AI patterns

- **Account menu** adds Saved items, Community requests, Notifications, Your reports and
  Policies; "Review workspace" appears only for members with the reviewer or admin role
  (the API checks the role again on every admin route).
- **Rating stars** (`RatingStars`) carry a text label ("4 out of 5"); the profile shows
  the average as a number next to the stars, and the review form uses real radio
  buttons, so the rating is not conveyed by colour or icon alone.
- **Public profile** (`/members/[uid]`) shows only safe fields: display name,
  neighborhood when the member allows it, verification labels, rating summary and
  visible reviews. A simulated demo check is labelled "Demo check (simulated)" and is
  never shown as identity verification.
- **Dispute page** shows status, statements, the linked condition records (latest
  version first, earlier versions readable) and, once resolved, the outcome and the
  simulated refund and compensation lines.
- **Review workspace** (`/admin`): queues for reports, disputes and verification checks;
  a conflict-of-interest notice replaces the actions when the reviewer took part in the
  booking; the resolution form shows a live balance check ("Balanced" or the
  difference) before submit.
- **Save button** on item pages toggles with `aria-pressed`; Saved items lets a member
  set alert dates. Saving never reserves the item, and the page says so.
- **Community requests** show the request, the offers and "Choose offer"; choosing leads
  to the item page with the dates filled in. No reservation is made by choosing.
- **Explore filters** add a date range and a price range (SAR, converted to halalas on the
  server). When the scan budget is reached the list ends with "Keep searching" rather
  than claiming there are no more items.
- **Related items** on the item page: "You might also need" with an AI note and icon when
  the AI model answered, otherwise "Similar items" from the same category, without any AI
  label. Nothing is shown when there are no candidates.
- **Policies** (`/policies`, `/policies/[key]`): every policy shows "Draft vX" or
  "Approved vX"; a warning explains that drafts await the team's approval. The assistant
  panel shows the answer, the cited policies as links, whether it was AI-generated or an
  extract, and a limitation message when it cannot answer.
- **Condition corrections** create a new version; the page lists earlier versions as
  read-only.
- **Rate limits**: a refused action shows the API message "Too many requests. Try again
  in N seconds." in the form's error area.

## Scope

Not available, and therefore not shown as buttons: distance filters, real payments,
real identity verification (only email verification and simulated demo checks), push
or email notifications, and AI features without an OpenAI key (the fallbacks run and
are labelled as such).
