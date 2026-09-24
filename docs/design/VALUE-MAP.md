# VALUE-MAP

Every screen in the set, put to one test.

> **Redrawn 16 September 2026.** Money is now five screens with figures, not one setup card — ADR-0014's
> addendums of 15 September moved the chartered-accountant gate from the build to the statutory output.
> The project scope adds one ruling of its own. The counts below are measured on the rebuilt set.

> **Rethemed later on 16 September.** No value line changed: the retheme replaces how every screen looks,
> not what any of them is for. One screen is added — *Your preferences › Keyboard*, where a person turns
> single-key shortcuts off. And the pages of Buying, Money and Projects now sit in sidebar sections rather
> than tabs under the page title; a verdict of **Demote** still means *not a permanent top-level slot*.

> **The elements, 17 September.** No value line changed. Twelve samples are added — the same screens with a
> published component drawn in them (a banner, an inline edit and a date picker, a dropdown menu and a modal, a
> flag and an inline message, the three kinds of wait) and two charts (projects by health, ordered by month) —
> and each is ruled exempt: it is a screen already ruled on, in another state. The whole-page answers in part 12
> and part 3 — unreachable, not found, gone wrong, signed out, a project you cannot open — are now drawn as
> empty states, which changes their shape and not their sentence.

> **The familiar look, 18 September.** No value line changed: the theme became the one our buyers run their
> books in, which changes how every screen looks and not what any of them is for. One sample is added and
> ruled exempt — *Today › the + New menu open*, Today in another state — and one specimen on the foundations
> page, *Colour where it carries meaning*, which is scales and components, not a screen. Today's Money card
> returns in a new shape (below).

> **The build and the look, 19 September.** One value line is added — *Settings — all thirteen pages*, the one
> screen that did not exist: every setting in one place. No other line changed. Six lists now lead with their
> full-width state, and that sample carries the line; the same list with a record open beside it follows as a
> second sample, ruled exempt (*a row clicked*): Buying › Orders, Approvals, Money › Bills, Payments, Client
> billing and Retention. Today's three tiles changed shape, not sentence.

> **The navigation, 19 September, later.** Five value lines are added, for the five screens that did not
> exist: *Overview — a project's Today*, *Today · Getting started*, *Reports — the Reports Center*,
> *Settings › Terminology*, and *Navigation · the same list inside SAN-01* — the frame's own line, which
> replaces *One project at a time* below (its sentence is the same idea with the sidebar in it). *Settings — all
> thirteen pages* becomes *Settings — the hub the gear opens*, the same line on a new shape. Seven samples are
> added and ruled exempt: Buying › Orders with its saved views open and with its kebab open, and on part 3 the
> two trees, the switcher open, the quick-create menu, recent history, the rail, a phone, and the edge states
> — a link to a project you are not on, one that is not there, one to a module that is off, and the server
> unreachable — each the shell in another state.

> **The grid, 19 September, last of all.** No screen's value line changed. Today and Overview moved onto one grid
> with one card, and every panel on them carries its own line, under its help icon and in the table under *Today*
> below (`VALUE` in `build/panels.mjs`). Three forms went because they drew a fact a second time — the six rings under
> the meter list, the approvals-ageing columns (the hero says *2 older than a week* instead), the *Past its contract
> ceiling* tile (KRA-01's 127% is in the meter list; the tile in its place is *Unsigned variations*, the action rather
> than the problem). Where the seed cannot produce a panel's data the panel is drawn absent in product words and the
> gap is recorded here, never on the screen: **milestones** — no agreement stage carries a date; **cash by account** —
> no cash position until the Tally connector is linked (ARCH-CASH stays open; the product has receipts and payments and
> no cash book, which is why the line chart is *Money in and out* and not *Cash flow*); **site today** — no report is
> dated today, so the lead line says *0 of 4 sites reported today · 2 of 4 yesterday* and names the two that did not;
> **unsigned variations** — the seed records no sent date, so no *oldest*; **pipeline** — no expected close date, so
> *closing this month* is not drawn, and the panel says what to add for it to appear. One sample is added and ruled
> exempt: *Today with Sales and Site switched off*, Today in another state with two rows re-flowed.

> **The charts, 19 September, later still.** No screen's value line changed, and six panel lines are added under
> Today's and Overview's: each new chart panel names, under its help icon, what it is for — *Billed against
> collected* (a good billing month is not mistaken for a good cash month), *Spend by trade package* (the trade
> running away is obvious before it is over), *Ordered against contract* as rings (the one past its contract
> printed, not coloured), *Approvals ageing* (a nine-day-old order is not sitting behind one from this morning),
> *Site this week* (how many were on site each day, without ringing the site), and *Cash by account*, drawn
> absent with its reason. The lines are `VALUE` in `build/panels.mjs`. The Today sample is titled *the charts*.

> **The clean-up, 19 September, last.** No value line changed. The Today sample is titled for what it shows — one hero,
> three tiles, the money cards, the chart, your day — and the parts are renumbered to reading order (README), so a
> part number quoted below is the new one. The sample is now the product's demo seed (README): the people in the
> *Who / trigger* rows are the seed's — Shalini Kamath the admin, Farhan Qadri finance, Manjit Bains procurement —
> and a figure quoted in a *Changed* row is the sample's on the day that row was written.

> **1.** Who opens this, and what has just happened to make them open it?
> **2.** What do they do differently after looking at it?

Blank on either and the screen is decoration. The **value line** is the answer written as one
sentence in the client's words, phrased as an outcome rather than a feature — it is what gets said
out loud when the screen comes up in a demo. Each one is now visible on its own sample in the HTML,
and `align.mjs` fails the build if a sample holding a product screen has no line and has not been
explicitly ruled exempt.

---

## Summary

| | |
|---|---|
| Product screens ruled on | **33** — 27 before the Money pass, less the one Money setup card, plus the five Money screens, the project scope, and *Your preferences › Keyboard* |
| Passed on first read — the value line describes what was already drawn | **22** |
| Needed the screen changed, not just the sentence | **4** (Today, Sales › Pipeline, Buying › Vendors, Site › Daily log) |
| Merged into an adjacent screen | **0** |
| Demoted from a nav destination | **12 of 16** shipped destinations — a tab of a flat entry, or since the retheme a page inside a sidebar section |
| Kept for compliance — narrate honestly, never demo as a feature | **3** (Settings › Tax, Money › Retention, Money › Tax deducted) |
| Could not write a value line | **0** — but see *Screens I would not build yet* below |
| Samples carrying a value line | **34**, and **49** samples explicitly ruled exempt — patterns, the same screens in another scope, state or role, and since 17 September the same screens with a component drawn in them. Foundations', the components page's and the motion page's specimens are scales and components, not screens, and carry none |
| Value lines removed as second attachments | **5** — three role variants and two state patterns, all in §9 |
| Product table columns ruled on | **108 distinct** (125 counting repeated renders; 121 after the cuts) |
| Columns cut | **4** |

**Counts differ from the brief's and these are mine, measured from the rendered file.** The brief
said 44 samples / 31 tables / 190 columns / 16 nav destinations. I measure **50 samples**, **37
tables** (23 product + 14 belonging to the document itself), and **185 column headers** — of which
**125 are product columns** (108 distinct, 121 remaining after the cuts) and 60 belong to the document's own reference tables,
which are not product surfaces and are not subject to the column test. The nav figure of 16 is
right: the shipped product has 18 links, of which the bell and Settings are not destinations.

The column cut is small, and that is the honest finding rather than a soft one. The widest product
table is 8 columns (the BOQ, which is an estimator's working sheet where client rate and cost rate
are the entire point). Most are 4–6. The failure smell the brief describes — *a 9-column table
carrying 4 columns of reference data* — is not present. Four columns did fail and are gone.

---

## The screens

Verdict key: **Keep** · **Demote** (belongs as a tab or a page in a sidebar section, not a top-level destination) · **Merge** ·
**Compliance** (exists because GST, TDS or audit requires it).

### Today

| | |
|---|---|
| **Who / trigger** | Shalini, who runs the firm, at nine on Monday. The week has started and she does not know what moved over the weekend. |
| **What they do next** | Opens the one project that has committed past its budget; decides which vendors get paid this week; rings the person an approval has been sitting with for six days. |
| **Value line** | *Open it at nine and you know the three things that will cost you money this week, and who to ring about each one.* |
| **Verdict** | **Keep** — the only screen anybody opens without being sent there. |
| **Changed** | **The hero, and all three stats.** The hero was *88% of the Kestrel contract, ordered* — a progress bar. Nothing is owed on it, nobody is waiting, and no decision follows; it was the least urgent thing on a screen whose subtitle promises *the one thing that needs you*. It is now the ₹36,85,000.00 held by three approvals, naming Rahul (two of them, the oldest six days) and Meridian, with *Open all 3* and *Remind Rahul*. The stats were all three replaced earlier — *Ordered so far, all projects* went up forever and nobody acted on it; *In the pipeline* was unweighted, so it added a phone call to a contract out for signature; *Carpet tile in store* is a storekeeper's number on a director's screen. The set is now margin at risk, cash against this week's payables, and the 88% the hero vacated. |
| **Where the blocked stat went** | Nowhere — it was absorbed whole. Its count, its total, its oldest-waiting figure and its two owners are all in the hero, which is why the stat row could take the 88% without the screen carrying anything twice. |
| **The subtitle** | *"here is the one thing that needs you, then everything else"* is unchanged and is now true. It was the promise the old layout broke. |
| **The Money card** | Was a full-width setup panel, then a notice saying no figure appears on bills, dues, retention or client invoices until a chartered accountant has signed the rules off. **Removed on 16 September**: since ADR-0014's addendums those screens compute, and the notice was no longer true. *The shipped Today still shows it* — `apps/web/app/(shell)/page.tsx:184` — which now contradicts the shipped Money screens. |
| **The Money card, returned** | Since 18 September Today carries *Total receivables* and *Total payables* — each a total, a proportion bar of what is overdue, and the split beneath — and a cash-flow card of the six months to today from the payments and receipts recorded here. The figures are the Money screens' own, shown where the director looks first; nothing is computed on Today that Bills and Client billing do not already compute. |
| **The grid, since 19 September (last of all)** | One grid, one card, one form per fact, in the rows a director acts in. Each panel's value line, as it reads under the help icon: **the hero** — *The one figure that needs you this morning, and whose door to knock on.* **Margin at risk** — *Raise a variation or renegotiate the rate before the next order goes out on a project already past its cost budget.* **Payables this week** — *Decide what gets paid on Friday, with what is already overdue in front of you.* **Overdue receivables** — *Who to call today — the overdue money by how long it has been overdue.* **Unsigned variations** — *Work done that cannot be billed until the client signs — chase the signature, not the site.* **Total receivables** — *What clients still owe, and how much of it is already late.* **Total payables** — *What the firm owes vendors, and how much of it is already late.* **Money in and out** — *The trend of money coming in against money going out, month by month, without a bank feed.* **Cash by account** (absent) — *Cash by account is drawn from Tally once the connector is linked — until then the panel says so, and nothing is estimated.* **Ordered against contract** — *Every project against its own contract at a glance, the one past it printed, not coloured.* **Milestones this week** (absent) — *Which site slips before the client notices — the stages due or slipping this week.* **Site today** — *A site with no report is the first sign of a problem: which sites reported, who was on them, what is open.* **Your day** — *The five things on your list, the overdue ones marked.* **Spend by trade package** — *Which trades your money is going to, so the one running away is obvious before it is over.* **Pipeline** — *What is coming: the quotes a client is sitting on, and what is worth the site visit this month.* Module rules: Pipeline needs crm, Site today needs operations, Unsigned variations needs change_orders; a panel whose module is off is not drawn and its row re-flows. |
| **The charts, since 19 September (later)** | Superseded by the grid (above) the same day. Under the money cards, six panels on one chart grammar, each with its value line under its help icon: *Billed against collected* by month for the financial year, grouped columns with the totals in the legend; *Spend by trade package*, the top five and Other as one part-to-whole bar with the values in the legend; *Ordered against contract* as the meter list with a ring per project beneath it, the overrun printed; *Approvals ageing* in three columns with the emphasis on eight days and more; *Site this week*, head count by day with open issues beside; and *Cash by account* drawn absent — the product holds no cash position (HUMAN(ARCH-CASH)) — rather than a fake. |
| **Inside a project, since 19 September** | Today becomes **Overview** — its own line, below — in the same card language: the thing on this project that needs you as the hero, then contract against ordered against billed, margin at risk, this week on site; what the client is sitting on, the open variations, the next milestones, the team. Until then: the same screen narrows to the project: its one condition as the hero, what is held on it, its site cash and today's report, and a line saying what is waiting on you on other projects — because a scope narrows what you browse, never what you owe. Every state is in `12-project-scope.html`. |

### Today, week one — the setup state

| | |
|---|---|
| **Who / trigger** | The owner, on the day they signed up. |
| **What they do next** | Enters the four things without which nothing else works. |
| **Value line** | *On day one it says what to enter before anything else works, and how much of it is left.* |
| **Verdict** | **Keep.** The "five of six" sample is the same screen later and is ruled exempt from carrying its own line. |

### Notifications

| | |
|---|---|
| **Who / trigger** | Anyone, when the bell shows a count — they have been on site for three hours. |
| **What they do next** | Acts on the one thing that needs them; dismisses the rest. |
| **Value line** | *Everything that moved while you were on site, with the one thing that needs you at the top.* |
| **Verdict** | **Demote** — the bell in the top bar. An interruption is not a place. |

### Sales › Pipeline

| | |
|---|---|
| **Who / trigger** | Director or sales lead, at the Monday sales review. |
| **What they do next** | Moves a stalled deal, or chases the one that has not been touched in three weeks. |
| **Value line** | *See which deals have stopped moving, and what the quarter is really worth once each one is weighted by how far it has got.* |
| **Verdict** | **Keep** (as one of two tabs under a new *Sales* destination). |
| **Changed** | The stat was *In the pipeline* — a raw sum that treats a lead somebody mentioned on the phone as equal to a contract out for signature. Now weighted by stage, 10% at lead to 70% at negotiation, with the unweighted figure still shown beside it so nobody thinks the number shrank. |

### Sales › Leads

| | |
|---|---|
| **Who / trigger** | Sales, when they need one specific lead and the board is too big to scan. |
| **What they do next** | Opens it. |
| **Value line** | *Find one lead by name when the board has grown too big to scan.* |
| **Verdict** | **Demote** — a tab beside Pipeline. On its own it is a list with no reason to be open, which is the third failure smell; as the find-by-name view of the board it earns its place. |

### A won lead becomes a project — the handover drawer

| | |
|---|---|
| **Who / trigger** | Whoever won it, the moment the client says yes. |
| **What they do next** | Creates the project without retyping anything. |
| **Value line** | *Turn a won lead into a live project without retyping the client, the value or the scope.* |
| **Verdict** | **Keep** — a flow, not a destination. |

### Projects — the list

| | |
|---|---|
| **Who / trigger** | Director, asking "which of these needs me". |
| **What they do next** | Opens the one whose ordering has passed its contract. |
| **Value line** | *See which projects have ordered past their contract before the client works it out.* |
| **Verdict** | **Keep.** |

### Project › Build › BOQ

| | |
|---|---|
| **Who / trigger** | The buyer, with a trade ready to order. |
| **What they do next** | Selects lines and raises a purchase order from them. |
| **Value line** | *Turn the lines you priced into a purchase order without retyping a single quantity.* |
| **Verdict** | **Keep.** Eight columns, and all eight survive: client rate and cost rate sitting side by side is the margin, which is the entire reason the sheet exists. |

### Step 2 of 3 — the drawer

| | |
|---|---|
| **Who / trigger** | Same person, mid-flow. |
| **What they do next** | Picks the vendor and the date. |
| **Value line** | *Raise the order against the right vendor and the right project, so it can never be filed under a name that matches two suppliers.* |
| **Verdict** | **Keep.** The happy path lives here; the same form in its refused state is shown in §9 States, because a five-minute walkthrough that fails is not a walkthrough. |

### Project › Commercial › Variations

| | |
|---|---|
| **Who / trigger** | PM or commercial lead, after the client asks for something that is not in the contract. |
| **What they do next** | Sends it for sign-off, or chases the one the client has gone quiet on. |
| **Value line** | *Know what extra work the client has agreed to pay for, and what they have gone quiet on.* |
| **Verdict** | **Demote** — belongs to one project and is meaningless outside it. |

### Project › Documents

| | |
|---|---|
| **Who / trigger** | Anyone, in an argument. The client has just said "that is not what we agreed". |
| **What they do next** | Finds the signed drawing and sends it. |
| **Value line** | *Find the signed drawing in seconds when the client says that is not what we agreed.* |
| **Verdict** | **Demote** — a project tab, plus the top-bar search, which is how people actually look for a file. |

### Buying › Orders

| | |
|---|---|
| **Who / trigger** | The buyer, asking what is outstanding. |
| **What they do next** | Chases the one that has been sitting, or approves it. |
| **Value line** | *See every order still waiting on somebody, and which somebody.* |
| **Verdict** | **Demote** — the default tab of a new *Buying* destination. |

### Buying › an order (the full page)

| | |
|---|---|
| **Who / trigger** | The approver, from a notification or the queue. |
| **What they do next** | Approves, or declines the line that is above the agreed rate. |
| **Value line** | *Approve an order knowing, line by line, whether it is at the rate you already agreed.* |
| **Verdict** | **Keep.** Also the screen that carries the role variants — refused for a site engineer, actionable for an accountant. |

### Buying › Vendors

| | |
|---|---|
| **Who / trigger** | The buyer, about to ask for a price. |
| **What they do next** | Picks the vendor they already have a rate with. |
| **Value line** | *Pick the vendor you already have a rate with, instead of asking three people for a quote again.* |
| **Verdict** | **Demote** — a Buying tab. |
| **Changed** | The stat was *Rates agreed this quarter*, a cumulative count nobody acts on. Now *Rate contracts expiring in 30 days*, which has a deadline and a name attached. |

### Buying › Rates

| | |
|---|---|
| **Who / trigger** | The estimator or buyer, with an order in front of them waiting for a decision. |
| **What they do next** | Declines the line quoted above the agreed rate, or renegotiates. |
| **Value line** | *See when a vendor is quoting above the rate you already agreed, before you approve the order.* |
| **Verdict** | **Demote** — reached from the order being checked, never navigated to cold. |

### Buying › Stock

| | |
|---|---|
| **Who / trigger** | Storekeeper or buyer, before issuing material or before buying it. |
| **What they do next** | Reorders what is below its level. |
| **Value line** | *Know what is actually in the store before you buy it twice, or before the site runs out mid-week.* |
| **Verdict** | **Demote** — a Buying tab. |
| **Columns cut** | **Last movement.** "Issued 96 sqm · 05 Sep" is a fact about one past event; nobody sorts by it, nobody filters by it, and the reorder decision is made from On hand against Reorder at. It belongs on the item. |

### Site › Daily log

| | |
|---|---|
| **Who / trigger** | The PM, in the morning, wanting to know what happened yesterday without ringing five people. |
| **What they do next** | Acts on an issue, or chases the site that has not filed. |
| **Value line** | *Know what happened on site without ringing five people, and have it written down when the client asks in four months.* |
| **Verdict** | **Demote** — a tab under a new *Site* destination. |
| **Changed** | The stat *Reports filed today* was a count going up; now *Sites with no report today*, naming them. |
| **Columns cut** | **On site** and **Lines of work** — two counts with nothing to compare them against, so neither tells you whether the day was good or bad. The reason anybody opens this list is the Issues column. |

### Site › Imprest

| | |
|---|---|
| **Who / trigger** | The site engineer who spent the cash, or the accountant reconciling it. |
| **What they do next** | Records a spend, or chases the two entries with no receipt. |
| **Value line** | *Know where the site cash went, and which spends still have no receipt behind them.* |
| **Verdict** | **Demote** — a Site tab. Also the clearest separation-of-duties screen in the file: the person who spends records, the person who reconciles cannot. |

### Site › Measurement

| | |
|---|---|
| **Who / trigger** | The QS, building a running-account bill. |
| **What they do next** | Certifies the quantities the bill will be raised against. |
| **Value line** | *Build the running bill from what was actually measured, so the client's QS has nothing to argue with.* |
| **Verdict** | **Keep.** This was filed under compliance and that was a mistake — no statute asks for a measurement sheet. It is a **money-protection** screen: the evidence that the money on a running bill was *earned*, line by line, and the one document that survives the client's QS disputing a quantity. Seven columns, all seven kept, because Previous / This period / To date is the arithmetic that argument turns on. **Demo it** — to a contractor who has been short-paid on a running bill, this is the screen that sells the product. |

### Site › Recce

| | |
|---|---|
| **Who / trigger** | Sales or PM, after visiting a site they have been asked to price. |
| **What they do next** | Prices the job from what is actually there. |
| **Value line** | *Price the job from what the site actually is — the levels, the access, what is already there — instead of from the brief.* |
| **Verdict** | **Demote** — a Site tab, also opened straight from a lead, which is where it really starts. |

### Approvals — the queue

| | |
|---|---|
| **Who / trigger** | An approver, from the sidebar count or a notification. |
| **What they do next** | Clears the decisions holding other people up, oldest first. |
| **Value line** | *Clear the decisions that are holding up other people's work, oldest first.* |
| **Verdict** | **Keep** — it carries a count and holds up other people's work, so it must be one move away. |

### Approvals › Tasks

| | |
|---|---|
| **Who / trigger** | Anyone, checking what is late. |
| **What they do next** | Chases the overdue one. |
| **Value line** | *See what is overdue and who has it, so nothing sits for a week because two people each thought it was the other's.* |
| **Verdict** | **Demote** — a tab. Today's tasks also appear on Today, which is where they actually get done. |
| **Changed** | The stat *Done this week* was a scoreboard. Now *Overdue*, computed from rows that really are late — two were added to the fixture, because a stat that reads 0 is not an exception metric, it is a decoration that happens to be true. |

### Money › Bills

| | |
|---|---|
| **Who / trigger** | The accountant on Monday, or when a vendor rings about a bill. |
| **What they do next** | Pays what is due this week, acknowledges what has arrived, and chases the two that are overdue. |
| **Value line** | *Know what you owe this week and to whom, before the vendor rings to ask — and pay it from the same screen.* |
| **Verdict** | **Keep** — the default tab of Money. Every figure is gross, as the vendor claimed, so nothing on it is provisional. |

### Money › Payments

| | |
|---|---|
| **Who / trigger** | The accountant reconciling the bank, or a vendor asking why they received less than they billed. |
| **What they do next** | Opens the voucher and reads off what was deducted, under which section, and what was withheld. |
| **Value line** | *See what actually left the bank for each bill, and what was held back for tax and for retention, under which section.* |
| **Verdict** | **Keep.** The voucher is a generated statutory document, so while a rate is provisional it says *Draft: provisional rates* and never reaches Tally. |

### Money › Tax deducted

| | |
|---|---|
| **Who / trigger** | The accountant in the first week of the month, before the challan is due on the 7th; again at the quarter's end for 26Q. |
| **What they do next** | Downloads the challan and deposits it; hands the 26Q content to whoever files. |
| **Value line** | *The month's challan and the quarter's 26Q built from the payments you already recorded — not rebuilt in a spreadsheet the night before they are due.* |
| **Verdict** | **Compliance.** It exists because TDS law requires it. Never demoed as a feature; refused by name when drafts are off and a rate is provisional. |

### Money › Client billing

| | |
|---|---|
| **Who / trigger** | The accountant or PM, when a milestone is certified and the client can be billed. |
| **What they do next** | Raises the invoice, and records the receipt when the client pays. |
| **Value line** | *Raise the invoice against the contract, and know the day each client is due to pay.* |
| **Verdict** | **Keep.** A cancelled invoice keeps its number and its row. |

### Money › Retention

| | |
|---|---|
| **Who / trigger** | The accountant at handover, or when a vendor asks for what is being held. |
| **What they do next** | Releases a holding as a payment voucher. |
| **Value line** | *Know how much of each vendor's money you are still holding, and release it as a proper payment rather than a line in somebody's notebook. Not the exciting screen — the one that keeps the books straight at handover.* |
| **Verdict** | **Compliance.** Statutory, never demoed as a feature. |

### Vendor portal

| | |
|---|---|
| **Who / trigger** | The vendor, from an email link. An order has been sent to them. |
| **What they do next** | Accepts it, then sends a bill against it. |
| **Value line** | *Your vendor accepts the order and sends the bill here, so you stop chasing PDFs around WhatsApp.* |
| **Verdict** | **Keep** — a separate app, not a nav item. **Payments is now drawn as shipped**: what reached the vendor, the tax deducted and its section, the retention withheld. The vendor reconciles that tax against Form 26AS, so it is the one deduction figure a portal shows. Its *Provisional* pill is the neutral one — the vendor audience is shown no caution tone. |

### Client portal

| | |
|---|---|
| **Who / trigger** | The client, when a variation is sent for sign-off. |
| **What they do next** | Signs off, in writing, before the work is done. |
| **Value line** | *Your client signs off the variation in writing before you build it, so the extra work is agreed and not argued about at the end.* |
| **Verdict** | **Keep** — a separate app. **Billing is now drawn as shipped**: invoiced, paid and due, each invoice with its GST heads, and the draft line while the GST rate is provisional. |

### Settings — the hub the gear opens

| | |
|---|---|
| **Who / trigger** | Shalini, or whoever administers the firm, sent to change one setting — a numbering series, a role, who may sign in as a vendor — and not sure which of fourteen pages holds it. |
| **What they do next** | Presses the gear, reads the groups, opens the card. |
| **Value line** | *Find the setting you need without remembering which of fourteen pages it lives on.* |
| **Verdict** | **Keep** — the settings destination. Settings has left the sidebar: the gear opens this, and *Configure features* at the sidebar's foot opens Modules directly. |
| **Changed** | New on 19 September as a grouped table beside a category list; later that day the table became cards and the layout went to the Reports Center. A fourteenth page, Terminology, is new. |

### Settings › Terminology

| | |
|---|---|
| **Who / trigger** | The owner, once, when the firm's engineers keep saying *Estimate* and the product keeps saying *BOQ* — or a client brings *Change order*. |
| **What they do next** | Picks one word per pair; every label, column, menu and PDF heading follows. |
| **Value line** | *Call it what your engineers call it, and every screen and PDF says the same word.* |
| **Verdict** | **Keep** — one setting, read everywhere. New on 19 September; no such setting exists yet (README). |

### Reports — the Reports Center

| | |
|---|---|
| **Who / trigger** | Farhan on a Monday, or Shalini before a bank meeting, wanting the number the product already shows on a card somewhere — as a report they can run, filter and send. |
| **What they do next** | Opens Favourites, runs the one they use, stars a new one. |
| **Value line** | *Every report the firm runs, in one place, the ones you use starred at the top — and each is a number this product already shows on a card somewhere.* |
| **Verdict** | **Keep** — net-new, drawn and marked so on part 11: the module key exists and nothing runs. Which reports run, and on what read, is the product delta recorded in the README. |

### Overview — a project's Today

| | |
|---|---|
| **Who / trigger** | A PM who lives in one project, first thing; a director who picked it in the switcher to look for ten minutes. |
| **What they do next** | Deals with the one thing on it that needs them, reads contract against ordered against billed, sees what the client is sitting on and what is next on site. |
| **Value line** | *Inside one project it is the same morning screen: the thing on it that needs you, then contract against ordered against billed, what the client is sitting on, and what is next on site.* |
| **Verdict** | **Keep** — Today's slot inside a project, in Today's card language. New on 19 September, drawn on part 4 beside Today. |
| **The charts, later the same day** | Superseded by the grid the same day. Two panels under the tiles: this project's *Billed against collected* by month, and *Site this week* — its own head count by day, its open issues beside. |
| **The grid, last of all** | The same grid and card as Today, project scope: four tiles — **Ordered and billed** (*Where this project stands: how much of the contract is ordered, and how much of it is billed.*), margin at risk on this project, unsigned variations on this project, payables this week on this project; then milestones (absent — the four agreement stages listed, none dated) beside site this week for this site; then money in and out for this project at 8 beside **Team** (*Who is on this project, and who signs for the client.*) at 4. *Waiting on the client*, *Open variations* and *Agreement stages* went: the variation the client is sitting on is the tile, the stages are the milestones panel. On the seed every bill is this project's, so its payables tile coincides with the firm's — the seed, not a repeat. |

### Today · Getting started

| | |
|---|---|
| **Who / trigger** | The owner in week one, and whoever sets the firm up, until the seventh step is done. |
| **What they do next** | Does the next step — the one with the primary button — and comes back for the rest. |
| **Value line** | *A tab that stays until the seven setup steps are done — company, GSTIN and TAN, numbering, people, the first project, vendors, Tally — and then leaves.* |
| **Verdict** | **Keep** — a tab on Today, not a card in it; it leaves when it is done. New on 19 September. |

### Settings › Tax

| | |
|---|---|
| **Who / trigger** | The owner or accountant, once, during setup. |
| **What they do next** | Answers three questions about their own business, so the right rates apply to their payments and invoices. |
| **Value line** | *Two minutes once, and every tax figure in the product is worked out for your business — each rate marked provisional until a chartered accountant signs it. Nobody enjoys this screen; it is the one that keeps you filing on time.* |
| **Verdict** | **Compliance**, and the most important screen in the file for exactly that reason. |

### Operator console

| | |
|---|---|
| **Who / trigger** | Us, not the client. A new organisation needs creating or suspending. |
| **What they do next** | Provisions, changes a plan, or suspends. |
| **Value line** | *Not a customer screen. How we create, plan and suspend an organisation — and what we can see of one, which is deliberately very little.* |
| **Verdict** | **Keep** — internal. |
| **Columns cut** | **Numbering.** Provisioning configuration, read once when the organisation is created and never sorted, filtered or decided from afterwards. |

### Your preferences › Keyboard

| | |
|---|---|
| **Who / trigger** | A person who uses speech input or a switch device, or anyone a stray <kbd>/</kbd> has moved somewhere they did not mean to go. |
| **What they do next** | Turns single-key shortcuts off, once; <kbd>/</kbd> and <kbd>?</kbd> then type themselves, and the shortcut list stays in the account menu. |
| **Value line** | *Turn off one-key shortcuts if you use speech input or a switch, so a stray letter never moves you somewhere you did not mean to go.* |
| **Verdict** | **Keep** — reached from the account menu, not Settings, because it is the person's and not the firm's. It exists because WCAG 2.1.4 requires a way to turn character-key shortcuts off, so it is narrated honestly rather than demoed as a feature. |

### Navigation — the same list inside SAN-01

| | |
|---|---|
| **Who / trigger** | A PM or site engineer who works on one project all day, and a director who wants to look at one project for ten minutes. |
| **What they do next** | Picks the project once in the switcher; the sidebar becomes the project's, and every list, search and quick-create after that is the project's, until they step back out to All projects. |
| **Value line** | *Pick the project once in the morning, and the whole app becomes that project — its sidebar, its lists, its search, its quick-create — until you step back out to All projects.* |
| **Verdict** | **Keep** — not a screen but the frame, so it carries one line on its canonical render and every other navigation sample is ruled exempt. Was *One project at a time*: the same idea, now with the sidebar in it and no × to leave by. |

---

## Screens I would not build yet

I could write a value line for all 33, so nothing here failed outright. Three are worth flagging
anyway, because the sentence is true but thin and a thin sentence is a warning:

1. **Sales › Leads** — the line is *find one lead by name*, which is a search box, not a screen. It
   survives as a tab of Pipeline. If the board ever grows a decent search, this view should go.
2. **Approvals › Tasks** — the line depends entirely on the Overdue column being real. A tenant who
   never sets due dates gets a list with no reason to be open. Worth revisiting once there is usage
   data; do not give it a nav slot on the strength of the demo.
3. **Buying › Stock** — strong for a tenant with a central store, and pointless for one that has
   everything delivered to site. It is one page inside the Buying section, which is the right amount of
   commitment until we know how many tenants run a store at all.

## What the four verdicts mean in practice

- **Keep** — the screen earns its place as drawn, and the value line describes what is already there.
- **Demote** — good screen, wrong level. It is reached from the thing that makes you need it, not
  from a permanent sidebar slot.
- **Merge** — used nowhere. Nothing in this file duplicates another screen's trigger closely enough
  to justify folding it in; the two candidates (Pipeline/Leads, Orders/Vendors) are better as tabs
  under one destination, which is a demotion, not a merge.
- **Compliance** — exists because GST, TDS or audit requires it. Three screens. They are marked so
  they are never mistaken for features and so the demo narrates them honestly rather than skipping
  them and hoping nobody asks.
