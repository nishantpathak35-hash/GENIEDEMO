// illustrations.mjs — this product's own illustrations, in the style the owner described (17 September 2026; one drawing per
// subject since 19 September; six redrawn and a twenty-third added the same day — see the notes on each).
//
// Licence: the system's illustrations are published only through galleries marked for its own products, and its
// site licence forbids derivative works, so none is used, viewed as a model, or traced. These are drawn here from
// their plain subjects, in the described style:
//   blocks    flat shapes of the accent tokens, registered under the line (until 19 September they sat 4 by 3 units
//             off it, as a print off its register; the offset is gone and every shape is big enough to show its colour)
//   line      one hand-drawn line over the blocks, 2 units, round caps and joins, in the icon colour
//   imperfect long edges bow or lean a unit or two; corners are not quite square
//   sparkles  two or three small four-point marks in the line colour, off the object
// Canvas 160 × 160, the published maximum image size of an empty state. Decorative: every reference is aria-hidden
// and the heading and text say everything, which is what exempts the blocks from 3:1 — the line alone holds it.
//
// One concept per drawing, and one drawing per subject. Colourful for an empty or a celebratory state; the common
// states — no result, not found, unreachable, something went wrong, signed out — are the neutral set, paper grey
// under the line, as the published guidance draws them.
const blk = (cls, d) => `<path class="${cls}" d="${d}"/>`;
const ln = (d) => `<path class="l" d="${d}"/>`;
const sp = (x, y, s) => `<path class="sp" d="M${x} ${y - s}Q${x} ${y} ${x + s} ${y}Q${x} ${y} ${x} ${y + s}Q${x} ${y} ${x - s} ${y}Q${x} ${y} ${x} ${y - s}Z"/>`;

const DRAW = {
  // sunrise over a site board: the sun half up on a clean horizon at the left, its rays, the board on two posts
  // standing on the horizon at the right — nothing overlaps
  today: [
    blk('fb', 'M22 104A24 24 0 0 1 70 104Z'),
    blk('fc', 'M14 104Q80 100 146 105L146 112Q80 108 14 112Z'),
    blk('fa', 'M88 44L144 42L146 86L90 88Z'),
    blk('fn', 'M96 52L138 51L139 64L97 65Z'),
    ln('M22 104A24 24 0 0 1 70 104'),
    ln('M46 66V74M29 73l5 6M63 73l-5 6M12 90l8 3M80 90l-8 3'),
    ln('M14 104Q80 100 146 105'),
    ln('M88 44L144 42L146 86L90 88ZM97 65Q118 64 139 64M98 88V102M136 86V104'),
    sp(24, 44, 6), sp(148, 24, 5), sp(134, 130, 4),
  ],
  // a checklist on a clipboard: the clip at the top, four rows, the first two ticked
  tasks: [
    blk('fn', 'M40 34Q80 31 120 32L122 136Q81 139 42 138Z'),
    blk('fa', 'M64 26L96 25L98 40L66 41Z'),
    blk('fc', 'M50 56L64 55L65 69L51 70Z'),
    blk('fc', 'M51 80L65 79L66 93L52 94Z'),
    ln('M40 34Q80 31 120 32L122 136Q81 139 42 138Z'),
    ln('M64 26L96 25L98 40L66 41ZM72 26Q72 18 80 18Q88 18 88 25'),
    ln('M50 56L64 55L65 69L51 70ZM53 63l4 4 7-8'),
    ln('M51 80L65 79L66 93L52 94ZM54 87l4 4 7-8'),
    ln('M52 104L66 103L67 117L53 118ZM53 122L67 121'),
    ln('M74 62h34M74 86h28M75 110h32'),
    sp(24, 48, 6), sp(138, 52, 5), sp(140, 118, 4),
  ],
  // a bell: the crown, the shoulder, the waist, the flare to the lip, the clapper hanging under it — and a small tick
  // beside it, because an empty list of notifications is good news; no count on it, a count is the badge's job
  notifications: [
    blk('fb', 'M42 108Q51 101 50 90Q54 46 80 40Q106 46 110 90Q109 101 118 108Z'),
    blk('fn', 'M38 108Q80 104 122 108L124 120Q80 124 36 120Z'),
    ln('M42 108Q51 101 50 90Q54 46 80 40Q106 46 110 90Q109 101 118 108'),
    ln('M77 40Q80 31 83 40'),
    ln('M38 108Q80 104 122 108L124 120Q80 124 36 120Z'),
    ln('M80 120V126M76 130a4 4 0 1 0 8 0a4 4 0 1 0 -8 0'),
    ln('M126 60l6 6 10-12'),
    sp(24, 40, 6), sp(140, 96, 5), sp(28, 132, 4),
  ],
  // a lead card: the person, their name and firm, and the stage tag in the corner
  sales: [
    blk('fn', 'M30 42Q80 39 130 40L131 122Q80 125 32 122Z'),
    blk('fa', 'M44 62Q44 48 58 48Q72 48 72 62Q72 76 58 76Q44 76 44 62Z'),
    blk('fc', 'M92 100L128 99L129 116L93 117Z'),
    blk('fb', 'M38 92Q58 82 78 92L78 110L38 110Z'),
    ln('M30 42Q80 39 130 40L131 122Q80 125 32 122Z'),
    ln('M44 62Q44 48 58 48Q72 48 72 62Q72 76 58 76Q44 76 44 62ZM38 92Q58 82 78 92'),
    ln('M84 56h34M84 70h24'),
    ln('M92 100L128 99L129 116L93 117ZM100 108h20'),
    sp(20, 30, 6), sp(142, 52, 5), sp(140, 136, 4),
  ],
  // a floor plan: the outline, two internal walls, a door swung open, two rooms picked out
  projects: [
    blk('fn', 'M34 36L126 34L128 126L36 128Z'),
    blk('fc', 'M36 38L82 37L83 78L37 79Z'),
    blk('fb', 'M84 82L126 81L127 125L85 126Z'),
    ln('M34 36L126 34L128 126L36 128Z'),
    ln('M82 37L83 126M37 79L127 80'),
    ln('M83 60V78M83 60Q98 60 100 78'),
    ln('M100 34V50M110 34V50'),
    sp(20, 26, 6), sp(142, 62, 5), sp(146, 138, 4),
  ],
  // a BOQ sheet: the header band, rows, a quantity column, one row picked out, a pencil across the corner
  boq: [
    blk('fn', 'M38 22Q78 19 118 18L124 136Q83 139 42 140Z'),
    blk('fa', 'M39 23Q78 20 118 19L119 40Q80 41 40 44Z'),
    blk('fb', 'M41 80Q81 78 121 77L122 96Q82 98 42 99Z'),
    ln('M38 22Q78 19 118 18L124 136Q83 139 42 140Z'),
    ln('M40 44Q80 41 119 40'),
    ln('M96 41L100 137'),
    ln('M41 62Q81 60 120 59M41 80Q81 78 121 77M42 99Q82 97 122 96M42 118Q83 116 123 115'),
    ln('M50 32h26M104 30h8'),
    ln('M50 53h30M106 51h7M50 71h22M106 69h9M51 89h34M107 88h8M51 108h26M107 106h9'),
    `<g transform="rotate(-42 124 126)">${blk('fb', 'M100 120h44v12h-44z')}${blk('a', 'M144 120h9v12h-9z')}${ln('M100 120h53v12h-53zM144 120v12M100 120l-13 6 13 6')}</g>`,
    sp(24, 36, 6), sp(140, 44, 5), sp(22, 112, 4),
  ],
  // a calculator: the body, the display, the keys, the equals key picked out
  rates: [
    blk('fa', 'M44 28Q80 25 116 26L118 134Q80 137 42 134Z'),
    blk('fn', 'M54 38L106 37L107 60L55 61Z'),
    blk('fb', 'M84 104L106 103L107 124L85 125Z'),
    ln('M44 28Q80 25 116 26L118 134Q80 137 42 134Z'),
    ln('M54 38L106 37L107 60L55 61ZM72 50h26'),
    ln('M54 72h12M70 72h12M86 72h12M54 88h12M70 88h12M86 88h12M54 104h12M70 104h12M54 120h28'),
    ln('M84 104L106 103L107 124L85 125ZM90 111h10M90 117h10'),
    sp(22, 44, 6), sp(138, 36, 5), sp(140, 116, 4),
  ],
  // an order form: the sheet, its header band, three lines with amounts, and the order number box in the corner
  orders: [
    blk('fn', 'M32 30Q80 27 128 28L130 130Q80 133 34 130Z'),
    blk('fa', 'M33 31Q80 28 128 29L128 50Q80 51 34 53Z'),
    blk('fb', 'M96 100L124 99L125 118L97 119Z'),
    blk('fc', 'M38 62L74 61L75 70L39 71Z'),
    ln('M32 30Q80 27 128 28L130 130Q80 133 34 130Z'),
    ln('M34 53Q80 51 128 50'),
    ln('M38 62L74 61L75 70L39 71ZM86 66h34M40 84h44M104 84h16M41 96h30M104 96h16'),
    ln('M96 100L124 99L125 118L97 119ZM102 109h16'),
    ln('M42 40h30'),
    sp(20, 44, 6), sp(142, 40, 5), sp(146, 130, 4),
  ],
  // a delivery crate in three-quarter view, slats and a brace, a label on the front, this way up on the side
  stock: [
    blk('fn', 'M34 70L62 50L130 50L102 72Z'),
    blk('fb', 'M34 70L102 72L100 134L36 132Z'),
    blk('fa', 'M102 72L130 50L128 112L100 134Z'),
    blk('a', 'M54 97L80 96L81 113L55 114Z'),
    ln('M34 70L102 72L100 134L36 132ZM34 70L62 50Q96 49 130 50L102 72M130 50L128 112L100 134'),
    ln('M45 71L46 133M91 72L90 134'),
    ln('M54 97L80 96L81 113L55 114ZM59 103h15M59 108h10'),
    ln('M115 102V78M109 85L115 78L121 83'),
    sp(22, 42, 6), sp(142, 30, 5), sp(146, 122, 4),
  ],
  // a shop front: the sign on the facade, the striped awning with its valance, a door with a knob, a window on its sill.
  // The facade's outline leaves out its top edge, which the sign's own bottom edge is; the awning hangs over the front.
  vendors: [
    blk('fn', 'M36 46L124 44L126 132L38 134Z'),
    blk('fb', 'M28 50L132 48L126 68L34 68Z'),
    blk('fn', 'M42 49.7L54 49.5L55 68L43 68ZM66 49.3L78 49L79 68L67 68ZM90 48.8L102 48.6L103 68L91 68ZM114 48.3L126 48.1L124 68L115 68Z'),
    blk('fa', 'M40 30L120 28L122 44L38 46Z'),
    blk('fa', 'M52 96L74 95L75 133L53 134Z'),
    blk('fc', 'M88 90L116 89L117 110L89 111Z'),
    blk('fn', 'M85 111L120 110L120 115L85 116Z'),
    ln('M36 46L38 134L126 132L124 44'),
    ln('M28 50L132 48L126 68L34 68Z'),
    ln('M34 68Q39.75 76 45.5 68Q51.25 76 57 68Q62.75 76 68.5 68Q74.25 76 80 68Q85.75 76 91.5 68Q97.25 76 103 68Q108.75 76 114.5 68Q120.25 76 126 68'),
    ln('M40 30L120 28L122 44L38 46ZM56 37h48'),
    ln('M52 96L74 95L75 133L53 134ZM67 117a2 2 0 1 0 4 0a2 2 0 1 0 -4 0'),
    ln('M88 90L116 89L117 110L89 111ZM102 89.5V110.5M88.5 100.5L116.5 99.5M85 111L120 110L120 115L85 116Z'),
    ln('M18 140Q80 136 142 140'),
    sp(20, 24, 6), sp(146, 30, 5), sp(146, 128, 4),
  ],
  // an empty in-tray: the floor seen from above, the front with its slot, and a small tick on the floor — nothing in it
  approvals: [
    blk('fn', 'M44 62L116 60L128 84L32 86Z'),
    blk('fa', 'M30 86L130 84L128 120L32 122Z'),
    ln('M44 62L116 60L128 84L32 86ZM30 86L130 84L128 120L32 122Z'),
    ln('M72 102h16'),
    ln('M70 74l7 7 13-14'),
    sp(24, 40, 6), sp(138, 44, 5), sp(140, 130, 4),
  ],
  // a site cone on its base, two bands, standing on the ground in front of the day
  daily: [
    blk('fa', 'M36 72Q30 30 76 26Q124 22 126 66Q130 106 86 110Q42 114 36 72Z'),
    blk('fc', 'M26 134Q80 126 136 133Q82 142 26 134Z'),
    blk('fb', 'M76 28Q80 22 84 28L108 118L52 120Z'),
    blk('fn', 'M68.7 56L91.5 56L95.2 70L65 70ZM60.3 88L100 88L103.7 102L56.7 102Z'),
    blk('fb', 'M38 120Q80 117 122 118L126 132Q80 135 34 134Z'),
    ln('M76 28Q80 22 84 28L108 118M52 120L76 28'),
    ln('M68.7 56Q80 55 91.5 56M65 70Q80 71 95.2 70M60.3 88Q80 87 100 88M56.7 102Q80 103 103.7 102'),
    ln('M38 120Q80 117 122 118L126 132Q80 135 34 134Z'),
    sp(26, 30, 6), sp(138, 36, 5), sp(144, 96, 4),
  ],
  // a tape measure, the case and its hub, the lock, the tape run out with its ticks and hook
  measure: [
    blk('fb', 'M94 104L146 102L147 115L94 117Z'),
    blk('fa', 'M28 60Q28 48 40 48L86 47Q98 47 98 60L99 106Q99 118 86 118L40 119Q28 119 28 106Z'),
    blk('fn', 'M52 83Q52 72 63 72Q74 72 74 83Q74 94 63 94Q52 94 52 83Z'),
    blk('a', 'M50 48L51 40L70 39L71 47Z'),
    ln('M28 60Q28 48 40 48L86 47Q98 47 98 60L99 106Q99 118 86 118L40 119Q28 119 28 106Z'),
    ln('M52 83Q52 72 63 72Q74 72 74 83Q74 94 63 94Q52 94 52 83ZM62 83h2'),
    ln('M50 48L51 40L70 39L71 47'),
    ln('M99 104L146 102L147 115L99 117'),
    ln('M108 103.5v5M117 103v8M126 103v5M135 102.5v8M144 102v5'),
    ln('M146 100L152 99.5L153 118L147 118'),
    ln('M24 66L24 100'),
    sp(22, 30, 6), sp(120, 44, 5), sp(138, 78, 4),
  ],
  // a camera: the body, the viewfinder centred on it, the lens centred on the body with its glass, the flash, and the
  // strap looped over the top from one lug to the other
  recce: [
    blk('fa', 'M32 62L128 60L130 120L34 122Z'),
    blk('fn', 'M56 91a24 24 0 1 0 48 0a24 24 0 1 0 -48 0Z'),
    blk('fc', 'M67 91a13 13 0 1 0 26 0a13 13 0 1 0 -26 0Z'),
    blk('fb', 'M106 68L122 67L123 76L107 77Z'),
    ln('M32 62L128 60L130 120L34 122Z'),
    ln('M64 62L68 50L92 49L96 61'),
    ln('M56 91a24 24 0 1 0 48 0a24 24 0 1 0 -48 0M67 91a13 13 0 1 0 26 0a13 13 0 1 0 -26 0'),
    ln('M106 68L122 67L123 76L107 77Z'),
    ln('M36 62Q42 28 80 26Q118 28 124 60'),
    sp(18, 44, 6), sp(142, 40, 5), sp(146, 126, 4),
  ],
  // a drawing roll, the sheet let down from it, a plan on the sheet with two rooms picked out
  documents: [
    blk('fn', 'M38 56L36 132Q80 135 124 130L122 54Z'),
    blk('fc', 'M49 70L80 69L81 95L49 96Z'),
    blk('fb', 'M81 100L112 99L113 118L81 119Z'),
    blk('fa', 'M34 34Q80 31 128 32L128 54Q80 53 34 56Z'),
    ln('M38 56L36 132Q80 135 124 130L122 54'),
    ln('M34 34Q80 31 128 32M128 54Q80 53 34 56'),
    ln('M34 34Q27 34 28 45Q28 56 34 56M128 32Q134 32 134 43Q134 54 128 54Q122 54 122 43Q122 32 128 32Z'),
    ln('M128 38Q125 38 125 43Q125 48 128 48'),
    ln('M48 70L112 68L113 118L49 120ZM80 69L81 100M49 96L68 95M81 100L112 99'),
    ln('M68 95Q70 103 80 104'),
    sp(20, 26, 6), sp(146, 72, 5), sp(20, 104, 4),
  ],
  // a paid voucher: the slip with its torn foot, the lines, the total, the round paid mark over it
  money: [
    blk('fn', 'M28 34Q72 31 116 30L120 124L112 130L104 124L96 130L88 124L80 130L72 124L64 130L56 124L48 130L40 124L32 130Z'),
    blk('fa', 'M29 35Q72 32 116 31L117 50Q73 51 30 53Z'),
    blk('fb', 'M84 58L110 57L111 70L85 71Z'),
    `<path class="a" fill-rule="evenodd" d="M68 100a22 22 0 1 0 44 0a22 22 0 1 0 -44 0ZM74 100a16 16 0 1 0 32 0a16 16 0 1 0 -32 0Z"/>`,
    ln('M28 34Q72 31 116 30L120 124L112 130L104 124L96 130L88 124L80 130L72 124L64 130L56 124L48 130L40 124L32 130Z'),
    ln('M30 53Q73 51 117 50'),
    ln('M38 42h24M38 64h40M38 76h30M38 88h20M38 108h14'),
    ln('M68 100a22 22 0 1 0 44 0a22 22 0 1 0 -44 0'),
    ln('M79 100l7 7 15-16'),
    ln('M84 58L110 57L111 70L85 71ZM90 64h14'),
    sp(18, 30, 5), sp(150, 100, 6), sp(138, 138, 4),
  ],
  // a cup of chai on its saucer, the steam rising — the client portal with nothing waiting, and time for one. The
  // saucer's outline stops where the cup stands in it.
  chai: [
    blk('fn', 'M30 112Q80 108 130 112L126 124Q80 130 34 124Z'),
    blk('fa', 'M50 64L56 110Q80 118 104 110L110 64Q80 70 50 64Z'),
    blk('fb', 'M50 64Q80 58 110 64Q80 70 50 64Z'),
    ln('M56 110Q42 110 30 112L34 124Q80 130 126 124L130 112Q118 110 104 110'),
    ln('M50 64L56 110Q80 118 104 110L110 64'),
    ln('M50 64Q80 58 110 64Q80 70 50 64Z'),
    ln('M110 76Q132 76 130 92Q128 102 106 102'),
    ln('M70 48Q65 40 70 32Q75 24 70 16M90 46Q85 38 90 30Q95 22 90 14'),
    sp(24, 36, 6), sp(140, 30, 5), sp(146, 120, 4),
  ],
  // ---- the neutral set: paper grey under the line ----
  // a magnifier over nothing: the ring, its glass, the handle
  search: [
    blk('fn', 'M44 68a28 28 0 1 0 56 0a28 28 0 1 0 -56 0Z'),
    ln('M44 68a28 28 0 1 0 56 0a28 28 0 1 0 -56 0'),
    ln('M92 88L124 120Q128 124 124 128Q120 132 116 128L84 96'),
    ln('M56 60Q60 52 70 50'),
    sp(24, 36, 6), sp(136, 44, 5), sp(30, 122, 4),
  ],
  // a signpost: the post, two boards pointing different ways
  'not-found': [
    blk('fn', 'M46 52L104 50L114 60L104 70L46 72Z'),
    blk('fn', 'M116 84L58 82L48 92L58 102L116 104Z'),
    ln('M46 52L104 50L114 60L104 70L46 72ZM116 84L58 82L48 92L58 102L116 104Z'),
    ln('M80 34V52M80 72V82M80 104V134M66 134h28'),
    ln('M56 61h30M70 93h30'),
    sp(24, 40, 6), sp(138, 36, 5), sp(140, 124, 4),
  ],
  // an unplugged cable: the plug, the socket it left, the cable lying loose
  unreachable: [
    blk('fn', 'M30 74L62 72L64 96L32 98Z'),
    blk('fn', 'M100 66L132 64L134 104L102 106Z'),
    ln('M30 74L62 72L64 96L32 98ZM64 78h10M64 90h10'),
    ln('M100 66L132 64L134 104L102 106ZM110 78v10M124 77v10'),
    ln('M30 86Q14 86 14 104Q14 122 40 122Q70 122 80 130'),
    ln('M134 84h14'),
    sp(22, 40, 6), sp(138, 36, 5), sp(112, 132, 4),
  ],
  // a warning triangle with its mark
  error: [
    blk('fn', 'M80 34L136 128L24 130Z'),
    ln('M80 34L136 128L24 130Z'),
    ln('M80 64V96M80 108V112'),
    sp(22, 44, 6), sp(140, 44, 5), sp(146, 132, 4),
  ],
  // a key on its ring: the way back in
  'signed-out': [
    blk('fn', 'M36 74a22 22 0 1 0 44 0a22 22 0 1 0 -44 0Z'),
    ln('M36 74a22 22 0 1 0 44 0a22 22 0 1 0 -44 0M52 74a6 6 0 1 0 12 0a6 6 0 1 0 -12 0'),
    ln('M80 74L136 72M112 72V86M126 72V82'),
    sp(24, 40, 6), sp(140, 44, 5), sp(140, 118, 4),
  ],
  // a row of buildings: three blocks, their windows, the ground
  operator: [
    blk('fa', 'M28 68L58 66L60 130L30 131Z'),
    blk('fc', 'M64 44L100 42L102 130L66 131Z'),
    blk('fb', 'M106 78L134 76L136 130L108 131Z'),
    ln('M28 68L58 66L60 130L30 131ZM64 44L100 42L102 130L66 131ZM106 78L134 76L136 130L108 131Z'),
    ln('M36 78h6M48 78h6M36 92h6M48 92h6M36 106h6M48 106h6M72 54h8M86 54h8M72 68h8M86 68h8M72 82h8M86 82h8M72 96h8M86 96h8M114 88h6M126 88h6M114 102h6M126 102h6'),
    ln('M18 132Q80 129 142 132'),
    sp(20, 34, 6), sp(140, 40, 5), sp(146, 100, 4),
  ],
};
export const ILLO_SUBJECTS = Object.keys(DRAW);
// Each place an empty state appears names the subject it draws, by the shipped Empty component's name where one
// exists. The shipped component takes thirteen: projects, search, documents, approvals, money, orders, leads, tasks,
// stock, daily, recce, notifications, measure. The rest are new names the product needs (README): today, boq, rates,
// vendors, not-found, unreachable, error, signed-out, operator, client. The vendor portal reuses the subject of the thing
// that is empty; the client portal, with nothing waiting, has its own — a cup of chai.
export const ILLO_FOR = {
  today: 'today', tasks: 'tasks', notifications: 'notifications', leads: 'sales', projects: 'projects', boq: 'boq', rates: 'rates',
  orders: 'orders', stock: 'stock', vendors: 'vendors', approvals: 'approvals', daily: 'daily', measure: 'measure', recce: 'recce',
  documents: 'documents', money: 'money', search: 'search', 'not-found': 'not-found', unreachable: 'unreachable', error: 'error',
  'signed-out': 'signed-out', operator: 'operator', client: 'chai',
};
export const ILLO_CAPTION = { today: 'sunrise over a site board', tasks: 'a checklist', notifications: 'a bell', sales: 'a lead card', projects: 'a floor plan', boq: 'a BOQ sheet', rates: 'a calculator', orders: 'an order form', stock: 'a delivery crate', vendors: 'a shop front', approvals: 'an empty in-tray', daily: 'a site cone', measure: 'a tape measure', recce: 'a camera', documents: 'a drawing roll', money: 'a paid voucher', search: 'a magnifier', 'not-found': 'a signpost', unreachable: 'an unplugged cable', error: 'a warning triangle', 'signed-out': 'a key', operator: 'a row of buildings', chai: 'a cup of chai' };
export const EMPTY_NAMES_SHIPPED = ['projects', 'search', 'documents', 'approvals', 'money', 'orders', 'leads', 'tasks', 'stock', 'daily', 'recce', 'notifications', 'measure'];
export const EMPTY_NAMES_NEW = Object.keys(ILLO_FOR).filter(k => !EMPTY_NAMES_SHIPPED.includes(k));
export const illoSymbols = (only = null) => ILLO_SUBJECTS.filter(n => !only || only.has(n)).map(n => `<symbol id="illo-${n}" viewBox="0 0 160 160" class="illo-art">${DRAW[n].join('')}</symbol>`).join('\n');
export const illo = (name) => {
  const subject = ILLO_FOR[name];
  if (!subject) throw new Error(`illo: no drawing is named for the empty state “${name}”`);
  return `<svg class="illo" viewBox="0 0 160 160" aria-hidden="true" focusable="false" data-subject="${subject}"><use href="#illo-${subject}"/></svg>`;
};
