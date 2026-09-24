// adjust.mjs — every place a published value failed one of our gates, and what replaced it.
//
// The rule: a gate is never lowered to admit a colour. Where a borrowed value fails, the smallest move within
// the same system is taken — the next step on the same ramp, or the documented token beside it — and the
// original, the replacement, the measurement and the reason are written here, once. tokens.mjs applies these
// and nothing else; TOKEN-DIFF.md and 00-foundations.html print this table rather than retyping it.
//
// token: the semantic token as published. mode: light | dark. from/to: palette names from the documentation.
export const ADJUST = [
  {
    token: 'color.text.warning', mode: 'light', from: 'Orange800', to: 'Yellow800',
    gate: 'status hues 40° apart, painted', before: 'caution 23.5° from loss (Orange800 hue 52°, Red800 hue 29°)', after: 'caution 56° from loss, 44° from done',
    why: 'In light, every step of the orange ramp paints within 25° of the danger red, so caution and loss read as two strengths of one colour. The yellow ramp is the nearest family that clears the floor on both sides.',
  },
  {
    token: 'color.background.warning', mode: 'light', from: 'Orange100', to: 'Yellow100',
    gate: 'caution is a fill carrying its own ink', before: 'an orange fill under a yellow ink', after: 'Yellow800 on Yellow100',
    why: 'The fill follows its ink, so caution stays one colour.',
  },
  {
    token: 'color.background.warning', mode: 'dark', from: 'Orange1000', to: 'Yellow1000',
    gate: 'hue parity — a fill resolves to the same family in both themes', before: 'Yellow100 in light (hue 100°) over Orange1000 in dark (hue 64°): 36° apart', after: 'Yellow1000 (hue 95°): 5° apart',
    why: 'The light surface was moved to the yellow ramp on 16 September so that caution stayed one colour; the dark surface was left as published and the fill changed family with the theme. The fill follows its ink in both.',
  },
  {
    token: 'color.text.warning', mode: 'dark', from: 'Orange300', to: 'Orange400',
    gate: 'status hues 40° apart, painted', before: 'caution 38.5° from done (Orange300 hue 89°, Lime300 hue 127°)', after: 'caution 54° from done, 49° from loss',
    why: 'In dark the published warning ink is nearly yellow and sits under the floor from the lime success ink. One step down the same ramp is amber again.',
  },
  {
    token: 'color.border', mode: 'light', from: 'Neutral300A', to: 'Neutral400A',
    gate: 'a table or card hairline is 1.4:1 on the card and the page, and under 3:1', before: '1.35:1 on the card and on the page', after: '1.96:1 and 1.95:1',
    why: 'Dense tables are read by scanning across them, and a rule under 1.4:1 disappears at arm’s length. The next alpha step on the same ramp is the smallest move that clears it, and it stays well under 3:1 so a grid of rules never out-shouts the figures inside it.',
  },
  {
    token: 'color.border', mode: 'dark', from: 'DarkNeutral300A', to: 'DarkNeutral350A',
    gate: 'a table or card hairline is 1.4:1 on the card and the page, and under 3:1', before: '1.39:1 on the card, 1.37:1 on the page', after: '1.69:1 and 1.67:1',
    why: 'As in light; the dark ramp publishes a half step, and it is enough.',
  },
  {
    token: 'color.border.input', mode: 'light', from: 'Neutral500', to: 'Neutral600',
    gate: 'a control boundary is 3:1 on every surface it can sit on (WCAG 1.4.11)', before: '2.86:1 on the hovered surface', after: '3.45:1 hovered, 3.90:1 on the card, 3.68:1 on the page',
    why: 'An input inside a hovered row or a sunken panel lost its edge. Neutral600 is the published color.border.bold, one step darker.',
  },
  {
    token: 'color.chart.categorical.2', mode: 'light', from: 'Lime500', to: 'Lime600',
    gate: 'a chart mark is 3:1 on the surface (WCAG 1.4.11)', before: '2.44:1 on white', after: '3.35:1',
    why: 'The published guidance says chart colours meet 3:1 on every surface; measured on white, this one does not.',
  },
  {
    token: 'color.chart.categorical.4', mode: 'light', from: 'Orange500', to: 'Orange600',
    gate: 'a chart mark is 3:1 on the surface (WCAG 1.4.11)', before: '2.47:1 on white', after: '3.33:1',
    why: 'As above — the published value measures under 3:1 on white.',
  },
  {
    token: 'color.chart.categorical.7', mode: 'light', from: 'Teal500', to: 'Teal600',
    gate: 'a chart mark is 3:1 on the surface (WCAG 1.4.11)', before: '2.45:1 on white', after: '3.32:1',
    why: 'As above — the published value measures under 3:1 on white.',
  },
  {
    token: 'color.chart.categorical.2', mode: 'dark', from: 'Lime400', to: 'Lime600',
    gate: 'the dark chart lightness band, 0.48–0.67', before: 'L 0.769', after: 'L 0.629',
    why: 'On a dark surface a mark that light glows against its neighbours and outweighs them; the band keeps the set at one weight.',
  },
  {
    token: 'color.chart.categorical.3', mode: 'dark', from: 'Purple400', to: 'Purple500',
    gate: 'the dark chart lightness band, 0.48–0.67', before: 'L 0.714', after: 'L 0.668',
    why: 'As above; one step down the same ramp.',
  },
  {
    token: 'color.chart.categorical.4', mode: 'dark', from: 'Orange400', to: 'Orange600',
    gate: 'the dark chart lightness band, 0.48–0.67', before: 'L 0.793', after: 'L 0.658',
    why: 'As above.',
  },
  {
    token: 'color.chart.categorical.5', mode: 'dark', from: 'Blue800', to: 'Blue700',
    gate: 'a chart mark is 3:1 on the surface (WCAG 1.4.11)', before: '2.47:1 on the dark surface', after: '3.17:1 on the card, 3.39:1 on the page',
    why: 'The published dark value is the light one, and on a dark surface it disappears.',
  },
  {
    token: 'color.chart.categorical.7', mode: 'dark', from: 'Teal500', to: 'Teal600',
    gate: 'the dark chart lightness band, 0.48–0.67', before: 'L 0.716', after: 'L 0.635',
    why: 'As above.',
  },
  {
    token: 'color.chart.categorical.8', mode: 'dark', from: 'Orange600', to: 'Orange700',
    gate: 'no two categorical values the same', before: 'categorical 4 moved to Orange600, which categorical 8 already used', after: 'Orange700, 3.65:1',
    why: 'Moving categorical 4 made it identical to 8; 8 takes the next step so the sequence keeps eight distinct colours.',
  },
  {
    token: 'color.chart.categorical.6', mode: 'light', from: 'Purple700', to: 'Magenta700',
    gate: 'adjacent categorical colours distinct to a dichromat, ΔE 8', before: 'ΔE 3.7 from categorical 5 (blue) and 6.8 from categorical 7 (teal) under protanopia or deuteranopia', after: 'ΔE 10.9 and 9.0',
    why: 'The published sequence promises each colour is distinct from its neighbours across colour deficiencies. Measured, purple and blue collapse for a protanope or deuteranope at every step of the purple ramp. Magenta is the nearest hue that holds apart from both neighbours.',
  },
  {
    token: 'color.chart.categorical.6', mode: 'dark', from: 'Purple700', to: 'Magenta700',
    gate: 'adjacent categorical colours distinct to a dichromat, ΔE 8', before: 'ΔE 4.2 from categorical 5 and 6.8 from categorical 7', after: 'ΔE 13.4 and 9.0',
    why: 'As in light; one value serves both themes, as the published sequence does for this slot.',
  },
  {
    token: 'color.chart.danger.bold', mode: 'light', from: 'Red850', to: 'Red700',
    gate: 'the light chart lightness band, 0.43–0.77', before: 'L 0.423', after: 'L 0.557',
    why: 'The failure marker must hold the same weight as the line it marks.',
  },
  {
    token: 'color.chart.danger.bold', mode: 'dark', from: 'Red250', to: 'Red500',
    gate: 'the dark chart lightness band, and the chroma floor of 0.10', before: 'L 0.847, C 0.083 — a pale pink', after: 'L 0.666, C 0.187',
    why: 'The published dark marker is washed out; it reads as a highlight, not a failure.',
  },
  // ---- 17 September 2026: the lozenge's current anatomy paints a status as a subtler fill carrying a bolder ink.
  // Measured on the fills — the colour a reader meets first — two status pairs fell under the 40° floor the inks
  // already hold. The same rule as before: the nearest published family beside it, the ink following its fill.
  {
    token: 'color.background.success.subtler', mode: 'light', from: 'Lime200', to: 'Green200',
    gate: 'status hues 40° apart, painted — on the lozenge fills', before: 'done 36.9° from caution (Lime200 hue 126°, Orange200 hue 89°)', after: 'done 78° from caution, 92° from in progress',
    why: 'In light the lime and the pale amber fills read as two tints of one yellow-green. The green accent ramp is the nearest published family that clears the floor on both sides, and it is the accent the system already pairs with success.',
  },
  { token: 'color.background.success.subtler.hovered', mode: 'light', from: 'Lime250', to: 'Green250', gate: 'follows its fill', before: 'the lime ramp', after: 'the green ramp', why: 'A hovered lozenge stays the colour it was.' },
  { token: 'color.background.success.subtler.pressed', mode: 'light', from: 'Lime300', to: 'Green300', gate: 'follows its fill', before: 'the lime ramp', after: 'the green ramp', why: 'As above.' },
  { token: 'color.text.success.bolder', mode: 'light', from: 'Lime900', to: 'Green900', gate: 'the ink follows its fill', before: 'a lime ink on a green fill', after: 'Green900 on Green200', why: 'Done stays one colour.' },
  { token: 'color.border.success.subtle', mode: 'light', from: 'Lime300', to: 'Green300', gate: 'follows its fill', before: 'a lime edge', after: 'a green edge', why: 'As above.' },
  { token: 'color.background.success.subtler', mode: 'dark', from: 'Lime900', to: 'Green900', gate: 'follows the light theme', before: 'lime in dark, green in light', after: 'green in both', why: 'A status is one family in both themes, so a person switching theme does not see done change colour.' },
  { token: 'color.background.success.subtler.hovered', mode: 'dark', from: 'Lime850', to: 'Green850', gate: 'follows its fill', before: 'the lime ramp', after: 'the green ramp', why: 'As above.' },
  { token: 'color.background.success.subtler.pressed', mode: 'dark', from: 'Lime800', to: 'Green800', gate: 'follows its fill', before: 'the lime ramp', after: 'the green ramp', why: 'As above.' },
  { token: 'color.text.success.bolder', mode: 'dark', from: 'Lime200', to: 'Green200', gate: 'the ink follows its fill', before: 'a lime ink on a green fill', after: 'Green200 on Green900', why: 'As above.' },
  { token: 'color.border.success.subtle', mode: 'dark', from: 'Lime800', to: 'Green800', gate: 'follows its fill', before: 'a lime edge', after: 'a green edge', why: 'As above.' },
  {
    token: 'color.background.warning.subtler', mode: 'dark', from: 'Orange900', to: 'Yellow900',
    gate: 'status hues 40° apart, painted — on the lozenge fills', before: 'caution 26.4° from loss (Orange900 hue 54°, Red900 hue 28°)', after: 'caution 59° from loss, 40° or more from done',
    why: 'In dark the deep orange fill sits beside the deep red one as two browns. The yellow ramp is the nearest family that clears the floor from loss without closing on done, and it is the family the dark caution ink already takes.',
  },
  { token: 'color.background.warning.subtler.hovered', mode: 'dark', from: 'Orange850', to: 'Yellow850', gate: 'follows its fill', before: 'the orange ramp', after: 'the yellow ramp', why: 'A hovered lozenge stays the colour it was.' },
  { token: 'color.background.warning.subtler.pressed', mode: 'dark', from: 'Orange800', to: 'Yellow800', gate: 'follows its fill', before: 'the orange ramp', after: 'the yellow ramp', why: 'As above.' },
  { token: 'color.text.warning.bolder', mode: 'dark', from: 'Orange200', to: 'Yellow200', gate: 'the ink follows its fill', before: 'an orange ink on a yellow fill', after: 'Yellow200 on Yellow900', why: 'Caution stays one colour.' },
  { token: 'color.border.warning.subtle', mode: 'dark', from: 'Orange800', to: 'Yellow800', gate: 'follows its fill', before: 'an orange edge', after: 'a yellow edge', why: 'As above.' },
  {
    token: 'color.background.warning.subtler', mode: 'light', from: 'Orange200', to: 'Yellow200',
    gate: 'the India layer — saffron and India green are never adjacent', before: 'Orange200 at 54°, inside the saffron window, 8px from the done lozenge (green): 8 flag pairs on 00, 2 on 06', after: 'Yellow200 outside the window: 0 pairs',
    why: 'A caution lozenge sits beside a done lozenge in every status row, and the published pale orange beside the pale green on a white card draws the flag. The yellow ramp is the nearest family outside the saffron window, and it is the family the dark caution already takes, so caution is one colour in both themes.',
  },
  { token: 'color.background.warning.subtler.hovered', mode: 'light', from: 'Orange250', to: 'Yellow250', gate: 'follows its fill', before: 'the orange ramp', after: 'the yellow ramp', why: 'A hovered lozenge stays the colour it was.' },
  { token: 'color.background.warning.subtler.pressed', mode: 'light', from: 'Orange300', to: 'Yellow300', gate: 'follows its fill', before: 'the orange ramp', after: 'the yellow ramp', why: 'As above.' },
  { token: 'color.border.warning.subtle', mode: 'light', from: 'Orange300', to: 'Yellow300', gate: 'follows its fill', before: 'an orange edge', after: 'a yellow edge', why: 'As above.' },
  {
    token: 'color.text.warning.bolder', mode: 'light', from: 'Orange900', to: 'Yellow900',
    gate: 'the India layer — saffron and India green are never adjacent', before: 'Orange900 at 54°, inside the saffron window, as the caution lozenge’s ink beside the done lozenge: 8 flag pairs on 00, 2 on 06', after: 'Yellow900 at 87°: 0 pairs; 8.12:1 on Yellow200',
    why: 'The India layer reads every painted hue, the ink as much as the fill. Yellow900 is the same ramp as the fill and the same ink the dark caution takes, so caution is one colour in both themes.',
  },
];
