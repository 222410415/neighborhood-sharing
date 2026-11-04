# Interface guide

Neighborhood is a local item sharing marketplace. The look is "Calm Tech": quiet, uncluttered and slightly futuristic, built to get more done in fewer clicks. Items come first, each screen has one main action, and secondary actions stay out of the way. Headings use Sora, body text DM Sans, on a cool near-white ground with one teal accent.

## Sources of truth

- `apps/web/src/styles/tokens.css`: shared colors, radii, and motion durations.
- `apps/web/src/app/globals.css`: responsive layout and page patterns.
- `apps/web/src/components/ui/`: reusable controls and feedback.
- `apps/web/src/components/layout/`: site navigation and shared page layouts.

## Interaction

- Search, category and date choices update the URL, so filtered results can be shared.
- One search bar asks what, where and when. Dates carry through to the item page.
- Listing cards show only the photo, name, price and neighborhood.
- Frosted glass is used only on the navigation layer (top bar, phone tab bar, booking bar), never on content. A soft teal glow marks primary actions.
- Motion is short and subtle. `prefers-reduced-motion: reduce` removes nonessential animation.
- Focus rings, labels, semantic buttons and links stay visible for keyboard use. Touch targets are at least 44px. Status never relies on colour alone: booked days are crossed out and partly booked days carry a dot.

## Responsive layout

- Desktop: four listing columns, item page with a sticky booking panel.
- Tablet: three listing columns.
- Phone: search collapses to one summary bar, two listing columns, a four-item tab bar (Explore, Activity, List, Profile) instead of a menu, and on item pages a fixed price and Request bar replaces the tab bar.

## Exchange workflow patterns

- **Booking panel** (item page): one `RangeCalendar` picks pickup and return days, with default times that can be changed. The server quote shows the rental fee and refundable deposit on separate lines with a visible **Simulated** tag. "Add a message" and "Ask the owner" stay collapsed until wanted. Save and the "..." menu (similar items, availability alert, report) sit on the photo. Owners see Manage availability instead.
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
- **Activity** (`/activity`) brings together what needs you, messages and updates. Accept and Decline work on the card, and Decline asks for confirmation. The Activity link shows the unread count (polled every 30 seconds while the tab is visible). `/bookings`, `/messages` and `/notifications` hold the full lists.
- Condition forms require an explicit OK or Problem per checklist line, and the
  borrower's acknowledgement has no default choice.

## Trust, community and AI patterns

- **Account menu** (avatar) holds Profile, My listings, Saved items, Community requests, Your reports and
  Policies, and on phones the same links are on the Profile page; "Review workspace" appears only for members with the reviewer or admin role
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
- **Save** is a heart on the photo (cards and item page) and toggles with `aria-pressed`; Saved items lets a member
  set alert dates. Saving never reserves the item, and the page says so.
- **Community requests** show the request, the offers and "Choose offer"; choosing leads
  to the item page with the dates filled in. No reservation is made by choosing.
- **Explore filters**: category chips, with free items and a price range (SAR, converted to halalas on
  the server) under Filters. When the scan budget is reached the list ends with "Keep searching" rather
  than claiming there are no more items.
- **Related items** on the item page: "You might also need" with an AI note and icon when
  the AI model answered, otherwise "Similar items" from the same category, without any AI
  label. Nothing is shown when there are no candidates.
- **Policies** (`/policies`, `/policies/[key]`): a draft policy shows a "Draft vX" tag
  and a warning that it awaits the team's approval; approved policies have no tag in the
  list, and their page shows the version and approval date. The assistant
  panel shows the answer, the cited policies as links, whether it was AI-generated or an
  extract, and a limitation message when it cannot answer.
- **Condition corrections** create a new version; the page lists earlier versions as
  read-only.
- **Rate limits**: a refused action shows the API message "Too many requests. Try again
  in N seconds." in the form's error area.

## Scope

Not available, and therefore not shown as buttons: an Arabic interface and language switch, distance filters, real payments,
real identity verification (only email verification and simulated demo checks), push
or email notifications, and AI features without an OpenAI key (the fallbacks run and
are labelled as such).
