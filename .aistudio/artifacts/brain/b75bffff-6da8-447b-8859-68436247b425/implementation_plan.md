# Dark-Themed Interactive Calendar Picker Implementation Plan

This plan outlines the architecture and design of a custom dark-themed React calendar popup component (`DarkDatePicker.tsx`) and global dark color-scheme CSS overrides, replacing the browser's default white date picker across `ProgressView.tsx` and `DateNavigator.tsx`.

---

### User Review & Critical Decisions

> [!IMPORTANT]
> The following parameters were confirmed based on your choices:

- **Confirmed Decision 1: Custom Interactive Calendar**: Replace the browser default `<input type="date">` with a custom React calendar popover component featuring a monthly day grid, smooth previous/next month navigation, "Today" shortcut, and active emerald selection highlights.
- **Confirmed Decision 2: Global Dark Theme Styling**: Apply dark theme styling globally: all native fallback inputs receive `color-scheme: dark;` with inverted picker icons via CSS in `index.css`, while primary app surfaces use the new interactive calendar component.

---

### 1. Overview & Core Concept

- **What It Does**: Provides an ergonomic, theme-matching calendar modal/popover with a dark slate background (`bg-slate-900`), emerald accents (`bg-emerald-600`), month/year navigation, and day-of-week grid cells designed for touch screens and desktop clicks.
- **Target Audience**: Users logging daily weights, past weigh-ins, or navigating dates who desire a unified athletic dark-mode aesthetic with zero blinding white browser popups.
- **Key Value**: Guarantees visual harmony across operating systems (macOS, iOS, Android, Windows) where default native date picker dropdowns often appear in high-contrast white.

---

### 2. User Experience & Visual Design

Following the *Mobile & Touch-First Applications* design standard (`10_mobile_touch_apps.md`):

- **Trigger Interface**:
  - Tactile trigger container (`bg-slate-800/80 border border-slate-700/80 rounded-xl px-3.5 py-2.5`) with a Lucide `Calendar` icon in emerald (`text-emerald-400`), human-readable formatted date label (e.g. `Oct 8, 2026`), and a subtle chevron indicator.
  - Hover state with border highlight and active tap feedback.

- **Interactive Calendar Dropdown**:
  - **Container**: `bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-4 w-72 z-50`.
  - **Header**:
    - Current Month & Year display in title font (`font-bold text-white text-sm`).
    - Chevron buttons for previous and next month navigation.
    - Quick "Today" jump button.
  - **Day Headers**: 7 columns (`Su, Mo, Tu, We, Th, Fr, Sa`) in muted slate typography (`text-[11px] font-semibold text-slate-500`).
  - **Day Cells**:
    - Generous touch hitbox ($\ge 36\text{px}$).
    - Selected day: `bg-emerald-600 text-white font-bold rounded-xl shadow-md shadow-emerald-950`.
    - Today's date: subtle emerald ring or border.
    - Out-of-month padding days: muted slate (`text-slate-600`).
    - Disabled future dates (when `maxDate` is set): dimmed and non-clickable (`opacity-30 cursor-not-allowed`).
  - **Backdrop & Dismissal**: Click-outside detection to close the dropdown cleanly.

- **Global CSS Fallback (`index.css`)**:
  - `input[type="date"] { color-scheme: dark; }`
  - Invert and style native webkit date indicators to prevent white popups on devices with native sheet controls.

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: Zero External Calendar Library Dependency**:
  - *Chosen Approach*: Build a lightweight, accessible React calendar engine without bloated 3rd-party date libraries (e.g., no heavy react-day-picker or moment.js).
  - *Why*: Keeps initial PWA bundle lean, instant-loading, and completely customizable with our custom Tailwind palette.
- **Decision 2: Seamless Date String Compatibility**:
  - *Chosen Approach*: The component accepts and emits standard ISO date strings (`YYYY-MM-DD`).
  - *Why*: Drop-in compatibility with Firestore, state hooks, and Zod validation schemas without converting back and forth between Date objects.

---

### 4. Technical Architecture & Component Mapping

#### Component Structure

```
┌────────────────────────────────────────────────────────┐
│            DarkDatePicker (src/components)             │
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Trigger Button: [ 📅 Oct 8, 2026            ▾ ]  │  │
│  └────────────────────────┬─────────────────────────┘  │
│                           │ (Toggle Popover)           │
│                           ▼                            │
│  ┌──────────────────────────────────────────────────┐  │
│  │  [ < ]      October 2026       [Today]   [ > ]   │  │
│  │  ----------------------------------------------  │  │
│  │   Su   Mo   Tu   We   Th   Fr   Sa               │  │
│  │        1    2    3    4    5    6                │  │
│  │   7   [8]   9   10   11   12   13   (Selected)   │  │
│  │  14   15   16   17   18   19   20                │  │
│  │  21   22   23   24   25   26   27                │  │
│  │  28   29   30   31                               │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

#### Files to Create & Update:

1. **`src/components/DarkDatePicker.tsx`**:
   - Reusable date picker component with props: `value`, `onChange`, `maxDate?`, `minDate?`, `className?`, `label?`.
2. **`src/components/ProgressView.tsx`**:
   - Replace native date input in Add Weight modal with `<DarkDatePicker value={entryDate} onChange={setEntryDate} maxDate={getTodayString()} />`.
3. **`src/components/DateNavigator.tsx`**:
   - Integrate `<DarkDatePicker>` to allow picking any day directly from the main date bar across Today, Food, and Workout tabs.
4. **`src/index.css`**:
   - Add `color-scheme: dark;` rule and `-webkit-calendar-picker-indicator` filter overrides.
