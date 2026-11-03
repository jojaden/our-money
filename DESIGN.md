---
name: 우리 집 가계부 (OUR MONEY)
description: A couple's month of money in an Apple-style finance app, with large titles, inset grouped lists, activity rings and two salary lanes.
colors:
  system-blue: "#0071e3"
  system-blue-press: "#0062c4"
  accent-blue: "#2a78d6"
  accent-blue-soft: "#e6f0fc"
  accent-blue-ink: "#0b5bbf"
  amber-partner: "#e8890c"
  amber-partner-soft: "#fff3e0"
  amber-partner-ink: "#a35a00"
  rose-partner: "#e8457a"
  rose-partner-soft: "#ffebf1"
  rose-partner-ink: "#b4235a"
  group-fixed: "#eb6834"
  group-living: "#2a78d6"
  group-allowance: "#eda100"
  group-saving: "#1baf7a"
  group-left: "#e5e5ea"
  grouped-ground: "#f2f2f7"
  surface: "#ffffff"
  raised: "#f9f9fb"
  well: "#efeff4"
  segment-track: "#e9e9ee"
  border: "#e5e5ea"
  rule: "#ececf0"
  control: "#c7c7cc"
  label: "#1c1c1e"
  secondary-label: "#48484d"
  tertiary-label: "#6e6e73"
  switch-green: "#34c759"
  positive: "#248a3d"
  negative: "#d70015"
  pill-negative-bg: "#ffeeee"
  pill-negative-ink: "#c0192a"
  pill-warning-bg: "#fff6e0"
  pill-warning-ink: "#8a4a00"
  pill-neutral-bg: "#efeff4"
  pill-neutral-ink: "#48484d"
typography:
  large-title:
    fontFamily: "Pretendard Variable, Pretendard, -apple-system, BlinkMacSystemFont, Apple SD Gothic Neo, Noto Sans KR, system-ui, sans-serif"
    fontSize: "32px"
    fontWeight: 700
    lineHeight: 1.12
    letterSpacing: "-0.025em"
  figure:
    fontFamily: "Pretendard Variable, Pretendard, system-ui, sans-serif"
    fontSize: "34px"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.03em"
    fontFeature: "normal"
  figure-compact:
    fontFamily: "Pretendard Variable, Pretendard, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.03em"
  amount-input:
    fontFamily: "Pretendard Variable, Pretendard, system-ui, sans-serif"
    fontSize: "36px"
    fontWeight: 700
    letterSpacing: "-0.03em"
    fontFeature: "\"tnum\""
  sheet-title:
    fontFamily: "Pretendard Variable, Pretendard, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Pretendard Variable, Pretendard, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "-0.02em"
  finding:
    fontFamily: "Pretendard Variable, Pretendard, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: 1.45
    letterSpacing: "-0.015em"
  row-title:
    fontFamily: "Pretendard Variable, Pretendard, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 500
    lineHeight: 1.35
    letterSpacing: "-0.015em"
  row-amount:
    fontFamily: "Pretendard Variable, Pretendard, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    fontFeature: "\"tnum\""
  body:
    fontFamily: "Pretendard Variable, Pretendard, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "-0.005em"
  subhead:
    fontFamily: "Pretendard Variable, Pretendard, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    letterSpacing: "-0.01em"
  small:
    fontFamily: "Pretendard Variable, Pretendard, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.5
  meta:
    fontFamily: "Pretendard Variable, Pretendard, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.35
  caption:
    fontFamily: "Pretendard Variable, Pretendard, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 600
rounded:
  card: "22px"
  sheet: "24px"
  block: "14px"
  control: "14px"
  row: "14px"
  segment: "12px"
  small: "10px"
  thumb: "9px"
  pill: "999px"
spacing:
  edge: "20px"
  pad: "22px"
  gap: "20px"
  stack-phone: "16px"
  list-inset: "52px"
  control-height: "48px"
  input-height: "52px"
  block-height: "52px"
  row: "64px"
  nav-height: "64px"
  rail-width: "56px"
  canvas-max: "1152px"
components:
  button-primary:
    backgroundColor: "{colors.system-blue}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "0 18px"
    height: "48px"
  button-primary-hover:
    backgroundColor: "{colors.system-blue-press}"
  button-primary-block:
    backgroundColor: "{colors.system-blue}"
    textColor: "{colors.surface}"
    rounded: "{rounded.block}"
    height: "52px"
    width: "100%"
  button-fab:
    backgroundColor: "{colors.system-blue}"
    textColor: "{colors.surface}"
    rounded: "{rounded.pill}"
    padding: "0 22px 0 18px"
    height: "50px"
  button-secondary:
    backgroundColor: "{colors.accent-blue-soft}"
    textColor: "{colors.accent-blue-ink}"
    rounded: "{rounded.control}"
    padding: "0 14px"
    height: "34px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.accent-blue-ink}"
    rounded: "{rounded.control}"
    padding: "0 8px"
    height: "36px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
    padding: "22px"
  row-pressable:
    rounded: "{rounded.row}"
    padding: "8px 10px"
    height: "64px"
  chip:
    backgroundColor: "{colors.well}"
    textColor: "{colors.secondary-label}"
    typography: "{typography.small}"
    rounded: "{rounded.pill}"
    padding: "0 14px"
    height: "38px"
  chip-selected:
    backgroundColor: "{colors.label}"
    textColor: "{colors.surface}"
  input:
    backgroundColor: "{colors.well}"
    textColor: "{colors.label}"
    rounded: "{rounded.control}"
    padding: "0 14px"
    height: "52px"
  input-focus:
    backgroundColor: "{colors.surface}"
  segmented:
    backgroundColor: "{colors.segment-track}"
    rounded: "{rounded.segment}"
    padding: "3px"
  segmented-thumb:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.label}"
    rounded: "{rounded.thumb}"
    height: "36px"
  toggle-on:
    backgroundColor: "{colors.switch-green}"
    rounded: "{rounded.pill}"
    width: "44px"
    height: "26px"
  category-icon:
    rounded: "{rounded.pill}"
    size: "40px"
  preset:
    backgroundColor: "{colors.well}"
    rounded: "16px"
    padding: "8px 14px 8px 8px"
  pill-negative:
    backgroundColor: "{colors.pill-negative-bg}"
    textColor: "{colors.pill-negative-ink}"
    rounded: "{rounded.pill}"
    padding: "0 8px"
    height: "22px"
  pill-warning:
    backgroundColor: "{colors.pill-warning-bg}"
    textColor: "{colors.pill-warning-ink}"
    rounded: "{rounded.pill}"
    padding: "0 8px"
    height: "22px"
  person-initial-a:
    backgroundColor: "{colors.amber-partner-soft}"
    textColor: "{colors.amber-partner-ink}"
    rounded: "{rounded.pill}"
    size: "32px"
  person-initial-b:
    backgroundColor: "{colors.rose-partner-soft}"
    textColor: "{colors.rose-partner-ink}"
    rounded: "{rounded.pill}"
    size: "32px"
  person-initial-joint:
    backgroundColor: "{colors.accent-blue-soft}"
    textColor: "{colors.accent-blue-ink}"
    rounded: "{rounded.pill}"
    size: "32px"
  ring:
    size: "96px"
  tabbar:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.tertiary-label}"
    height: "64px"
  tabbar-active:
    textColor: "{colors.accent-blue-ink}"
---

# Design System: 우리 집 가계부 (OUR MONEY)

## Overview

**Creative North Star: "Two Streams, One Pot"**

The month is drawn as money flowing. Two salaries, each with its own pale identity hue, run into four buckets: fixed costs, joint living money, allowances and savings. Each bucket has its own hue, and that hue follows it everywhere: the lane segments, the legend dots and the activity ring of its budget. The surface speaks the Apple idiom. There is a large title, inset grouped lists on #f2f2f7, white cards with no shadow, a translucent tab bar, iOS segmented controls and switches, and Health-style rings and Screen Time-style daily columns. The chrome stays neutral so that the data hues carry the meaning.

Density is calm and medium. On a phone it is one column with 20px edges, a translucent five-tab bar and a floating blue "지출 기록" pill. On a desktop it is a 56px rail beside a 12-column canvas, the floating button gives way to a "지출 기록" button in the header, and the two salary lanes sit side by side in one full-width card. Motion confirms touch and data. Rows and buttons press in on a spring, figures roll, rings and bars draw in from zero, and a just-saved row glows pale blue.

The lineage runs from the taste-skill `pastel-consumer` sheet (person tints, the lanes, flat cards) through a Toss refinement (Pretendard, heavy figures, filled inputs, category circles) to this Apple pass, at the user's request each time.

**Key Characteristics:**
- Grouped ground #f2f2f7, flat white cards at a 22px radius, and list hairlines inset past the leading icon.
- Pretendard only, with tracking that tightens as size grows. Large title 32/700, answer figure 34/700 with a 0.62em unit.
- System blue #0071e3 for actions. Accent blue #2a78d6 for joint money, done checks and focus. Selected filter chips are black.
- Four validated bucket hues (orange, blue, amber, green) shared by lanes, legends and budget rings.
- Activity rings for budgets and progress; Screen Time columns for daily spending.
- Translucent tab-bar material with a solid fallback when reduced transparency is requested.

## Colors

The palette is Apple's neutral greys and labels, one blue for interaction, two person tints, and four bucket hues for data.

### Primary
- **System Blue** (system-blue, press system-blue-press): Primary buttons, the block "…원 기록하기" button, the floating action and the desktop header action.
- **Accent Blue** (accent-blue, -soft, -ink): Joint money and interaction state. It covers ticked check rings, the task-progress ring, focus rings, joint initials and tiles, secondary buttons, the selected rail and tab icon (ink), the fresh-row glow and the "auto" note. It is also the living-money bucket.

### Secondary (people)
- **Amber Partner** and **Rose Partner** (each with -soft and -ink): Each partner's identity. A pale fill carries ink text in the dark of the same hue. These colours appear on initials, card and account tiles, the wallet icon for personal-allowance spending, and that partner's circle in the brand mark.

### Tertiary (bucket data)
- **Fixed Orange** (group-fixed), **Living Blue** (group-living), **Allowance Amber** (group-allowance), **Saving Green** (group-saving), **Unallocated Grey** (group-left): The four buckets plus the remainder. This set was checked with the dataviz validator and passes colour-vision-deficiency and normal-vision separation. A bucket's hue is used for its lane segment, its round legend dot, its budget ring, and the bars of single-bucket charts (the daily columns and category bars use Living Blue).

### Category hues
Each spending category has a pale circle with an icon in the saturated version of the same hue, defined in `src/lib/categories.ts`. The user chose the Toss-style display explicitly. These hues appear only inside 40px or 32px circles.

### Neutral
- **Grouped Ground** (grouped-ground): The page and rail plane; it is also the PWA theme colour.
- **Surface** (surface): Cards, sheets, the segmented thumb, focused inputs and the active rail cell.
- **Raised** (raised): The tab-bar material base (at 78% under blur, solid as the fallback) and the row hover fill.
- **Well** (well): Inputs, chips, quick-amount buttons, presets and the pressed-row fill. **Segment Track** (segment-track) is the segmented control's track.
- **Border / Rule / Control** (border, rule, control): Border is the chart baseline; Rule draws list hairlines (scaled to about 0.6px) and the split dividers inside cards; Control draws unchecked check rings and the sheet handle.
- **Label / Secondary / Tertiary Label** (label, secondary-label, tertiary-label): The three text steps. Tertiary label is for sub-lines, inactive tabs and axis labels.
- **Switch Green** (switch-green): Switches in the on state only.
- **Negative** (negative): Overspend only, such as an over-budget ring's second lap or an over-budget category bar. Overdue and due-soon dates use the negative and warning pills.

### Named Rules
**The Hue Follows the Bucket Rule.** Each bucket keeps one hue in every chart: lane segment, legend dot and budget ring. Don't reuse a bucket hue for an unrelated meaning.

**The Neutral Chrome Rule.** Navigation, cards, lists and controls stay grey, white and black. Blue is the only interactive hue; the other colours belong to data, people and categories.

**The Small-Marks Rule.** Person tints and category hues live only inside small round marks: initials, tiles and category circles. Never tint a card, row or panel.

**The Quiet Outgoing Rule.** Ordinary spending is shown in label ink. Red marks only overspend and overdue.

## Typography

**Font:** Pretendard Variable (self-hosted, subset), falling back to -apple-system, Apple SD Gothic Neo, Noto Sans KR and system-ui. Line breaks follow `word-break: keep-all`, so Korean words wrap whole.

**Character:** One neo-grotesque used the way SF is: tracking tightens as size grows (from -0.005em for body to -0.03em for figures), and weight is reserved for titles and money.

### Hierarchy
- **Large Title** (700, 32px, 1.12, -0.025em): The page h1 on every width. This is the iOS large title, kept knowingly against a size warning on phone.
- **Figure** (700, 34px, 1.1, proportional numerals): The answer figure in a BudgetCard. Its "원" unit is 0.62em, 600, in tertiary label. The compact variant is 28px.
- **Amount Input** (700, 36px, tabular): The big amount field in the spending sheet.
- **Sheet Title** (700, 22px): The question heading of a sheet.
- **Headline** (700, 20px, -0.02em): Card heads.
- **Finding** (600, 17px): The one sentence under the title.
- **Subhead** (400, 15px): The period line under the title, in tertiary label.
- **Row Title / Row Amount** (500 / 600, 16px): List rows. Amounts use tabular figures.
- **Small / Meta** (14 / 13, 500): Field labels, asides, kpi sub-lines, split labels.
- **Caption** (600, 11px): Tab labels, ring captions, chart axis ticks.

### Named Rules
**The Figure Reads, the Column Aligns Rule.** A lone answer figure uses proportional numerals with a small grey unit. Amounts stacked in rows and columns use tabular numerals. A missing value is shown as a faint en dash, never as 0.

**The One Figure Per Card Rule.** A card has at most one answer figure, placed under its head. Do not put a KPI strip across the top.

## Layout

On a phone, the page is one column with 20px edges and 16px gaps. The canvas reserves the tab bar plus 96px for the floating action. At 1024px and up, a 56px rail replaces the tab bar, the floating action is hidden in favour of a header button, and the canvas (capped at 1152px, padding 32/40) holds a 12-column grid with 20px gaps. Pages split 7 + 5. The salary-lanes card spans the full width with both lanes side by side (40px column gap).

Lists follow the inset grouped pattern. Rows are at least 64px tall, separated by a hairline that starts at the `--inset` offset (52px by default, 40–44px where the lead mark is smaller) so that it clears the leading icon. Tappable rows bleed 10px past the content edge for their press fill. Card padding is 22px. A BudgetCard pairs its figure block on the left with its ring on the right.

## Elevation & Depth

Depth is mostly tonal: white cards on a grouped grey ground, with no card shadows. Material and lift appear only where Apple uses them.

### Shadow and Material Vocabulary
- **Tab-bar material** (`background: rgb(249 249 251 / 0.78); backdrop-filter: blur(22px) saturate(180%); box-shadow: inset 0 0.5px 0 rgb(0 0 0 / 0.14)`): Content shows through the phone tab bar. Under `prefers-reduced-transparency` it becomes solid #f9f9fb.
- **Rail edge** (`box-shadow: inset -0.5px 0 0 rgb(0 0 0 / 0.12)`): The desktop rail's hairline.
- **Segment thumb** (`box-shadow: 0 3px 8px rgb(0 0 0 / 0.12), 0 3px 1px rgb(0 0 0 / 0.04)`): The floating iOS segment thumb.
- **Toggle knob** (`box-shadow: 0 1px 2px rgb(0 0 0 / 0.2)`).
- **Toast lift** (`box-shadow: 0 8px 24px rgb(17 24 39 / 0.2)`).
- **Sheet scrim** (`rgb(17 20 24 / 0.4)`).

### Named Rules
**The Flat Card Rule.** Cards never take a border or a shadow; the grouped ground separates them.

**The Hairline Rule.** Separators are sub-pixel (0.5–0.6px) and inset. Never use a full-bleed 1px rule between list rows.

## Shapes

Cards are 22px and sheets 24px. Buttons, block buttons, inputs and pressed rows are 14px. Presets are 16px. The segmented track is 12px and its thumb 9px. Chips, pills, initials, category circles, check rings, legend dots, lane bars and the floating action are full rounds. Lane bars are 12px-thick pills with 2px gaps between segments and rounded outer ends. Ring arcs use round caps. Daily columns have 4px top corners and are at most 12px wide. Category bars are 6px pills.

## Components

### Buttons
- **Primary:** System Blue, white 15/600 text, 14px radius. Block buttons are 52px and full width at 17/600. The floating action is a 50px pill on phone only.
- **Hover / Press:** Hover darkens to the press blue on fine pointers. Press scales to 0.96 (0.94 on the floating action) and springs back.
- **Secondary:** Pale accent fill with accent-ink text. **Ghost:** accent-ink text. **Danger:** red text.
- **Header action:** At 1024px and up, a primary "지출 기록" button sits beside the month arrows.

### Chips
- **Style:** 38px pills in the well, with secondary-label 14/600 text and no stroke. Category chips lead with their circle.
- **State:** Selected chips turn label black with white text (filters such as 전체 / 공동 / 현빈). Press scales to 0.95.

### Segmented control
- A Segment Track, 12px radius with 3px of padding. A floating white thumb (9px radius, with the lifted shadow) slides over 420ms on the drawer curve. Segments are 36px at 14/600. The selected label is label ink; the others are secondary label.

### Switch
- A 44 x 26 track: Control Grey when off, Switch Green when on, with a white knob.

### Check
- A 44px hit area around a 26px ring with a 1.5px Control border, in the style of Reminders. When ticked, the ring fills Accent Blue, pops on the spring and the check path draws in.

### Cards / Containers
- **Corner Style:** 22px. **Background:** white. **Border / Shadow:** none. **Padding:** 22px.
- **Head:** a 20/700 title on the left and a tertiary-label aside link with a drawn chevron on the right.

### Inset grouped list
- Rows have a lead mark (initial, tile, category circle or check), a 16/500 title and a 13px sub-line, and a right column with the 16/600 amount and a date or pill. Hairlines start after the lead mark.
- Pressing a row gives it the well fill and scales it to 0.98. On fine pointers, hover fills it with Raised. A just-saved row drops in and fades from a pale-blue glow.

### Activity Ring (signature)
- A Health-style ring, 96px by default with an 11px stroke. The track is the bucket hue at 16% opacity; the arc is the same hue with round caps, starting at 12 o'clock and drawing in over 1.1s.
- When spending passes the budget, a second lap is drawn in Negative. A white dot with a 2px ink outline marks today's expected pace on the arc. The center shows the percentage used with an 11px caption.
- The same component, in Accent Blue, shows task progress (28px in the home card head, 52px on the check page).

### BudgetCard
- A muted caption ("남은 돈") above a 34px figure (28 compact), a line "X 중 Y 사용", and a ring on the right in the bucket's hue.
- Below it, a pace line (pace dot glyph, "오늘까지 예상보다 …원 덜/더 썼어요", per-day allowance on the right) and a three-column card / cash / transfer split separated by inset rules.

### Daily Bars
- Screen Time-style columns, one per day of the pay period, in Living Blue with 4px top corners. Future days are 3px grey stubs.
- The plot has three gridlines with short right-aligned labels ("20만", "10만", "0") and a dashed average reference line labelled "평균".
- The header shows "하루 평균" and its figure. Hovering, focusing or tapping a column swaps the header to that day's amount, highlights the column in accent ink and dims the others to 45%.

### Category bar list
- One row per category: a category circle, the name, a 6px Living Blue bar against a grey track with a 2px ink tick at the budget, and "spent / budget" on the right. Over budget, the bar turns Negative.

### Salary Lanes
- One lane per partner: initial, name and income, then a 12px pill bar of bucket segments on one shared scale, then joint share and remainder in tertiary label. The legend uses round dots. On desktop, both lanes sit side by side in one full-width card.

### Inputs / Spending sheet
- Inputs are 52px well fields with no stroke and a 14px radius. Focus turns the field white with a 2px accent ring.
- The amount field is a 36/700 figure on a 2px underline that turns blue on focus, with "+1만 / +5만 / +10만 / 지우기" pills below.
- The sheet pre-fills smart defaults: the logger's own allowance and card, the owner inferred from the account, and the category inferred from the memo. Each guess is labelled inline in accent-ink 12/600.
- It also offers frequent-spend presets as 16px wells and a remaining-after-save preview. The block button repeats the amount.

### Navigation
- **Phone:** The translucent tab bar (see Elevation), with five 22px outline icons and 11/600 captions. Inactive tabs are tertiary label; the active tab is accent ink with its icon at 1.06x scale.
- **Desktop:** A 56px rail on the ground, with the brand mark at the top and 40px cells. The active cell is white with an accent-ink icon. Settings is pushed to the bottom.

### Motion
- **Spring** (`cubic-bezier(0.34, 1.36, 0.64, 1)`): Presses and the check pop.
- **Drawer curve** (`cubic-bezier(0.32, 0.72, 0, 1)`): Sheets and the segment thumb.
- **Ease-out** (`cubic-bezier(0.22, 1, 0.36, 1)`): Ring arcs (1.1s), lane bars and daily columns (700ms), category bars (800ms) and page entry (420ms; the month change slides in from the direction of travel).
- **Rolling numbers:** 720ms quartic ease-out.
- All of this is disabled under reduced motion.

## Do's and Don'ts

### Do:
- **Do** use the 32/700 large title, then the period subhead and one finding sentence, at the top of every page.
- **Do** keep cards flat white at a 22px radius on #f2f2f7, and separate list rows with hairlines inset past the lead mark.
- **Do** draw every budget as an activity ring in its bucket's hue, with a red second lap for overspend and a pace dot for today.
- **Do** keep each bucket's hue constant across lanes, legends and rings.
- **Do** give the answer figure proportional numerals with a 0.62em grey unit, and keep tabular numerals in rows and columns.
- **Do** use iOS controls as iOS draws them: a floating-thumb segmented control, a green switch, Reminders-style check rings.
- **Do** provide a solid fallback for every translucent material under reduced transparency.
- **Do** label every value the app guessed with a short accent-ink note beside the field label.

### Don't:
- **Don't** add shadows or borders to cards, or full-bleed rules between list rows.
- **Don't** use blue for anything but interaction, joint money and the living bucket, or let bucket hues decorate chrome.
- **Don't** tint whole cards, rows or panels per person or category.
- **Don't** colour ordinary outgoing amounts red. Red is for overspend and overdue only.
- **Don't** show the floating action on desktop; use the header button.
- **Don't** put a KPI strip across the top of a page, or use a gradient balance card.
