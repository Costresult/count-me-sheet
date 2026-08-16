# Count Me In

Create a new full-stack TypeScript project named COUNT ME. Build 01 is ONLY the Excel foundation; do not add microphone, speech recognition, AI, fuzzy matching, pronunciation learning, unit conversion, or chatbot yet.

PRODUCT: Count Me is a professional inventory-entry tool for restaurants, bars, cafes, nightclubs, hotels and kitchens. The uploaded Excel spreadsheet is the main interface, not a dashboard.

CORE FLOW:
1) User uploads .xlsx.
2) Parse workbook and detect worksheets dynamically.
3) Show chosen inventory worksheet as an Excel-style editable grid.
4) Handle 600–2000+ rows smoothly with virtualization.
5) User can manually edit numeric inventory cells.
6) Preserve row order, column order, formulas, existing values and as much workbook formatting as technically possible.
7) Never hard-code D:P or Q. Detect inventory/count columns and TOTAL dynamically. TOTAL is calculated output and must never be treated as an entry column.
8) Maintain ORIGINAL FILE and WORKING COPY separately; original must remain untouched.

MAIN UI:
The spreadsheet must occupy most of the screen. Avoid dashboards, graphs, cards and excessive dialogs. Turkish UI. Desktop, tablet, iPhone and Android responsive. Prepare as PWA where practical. Freeze product/unit columns when practical; allow horizontal and vertical scrolling.

IMPORTANT GRID RESIZE REQUIREMENT:
User must control the on-screen spreadsheet layout. Implement draggable column resizing, row-height resizing where practical, Kolonu Otomatik Sığdır, Tüm Kolonları Sığdır, and Görünümü Sıfırla. Product-name columns can be wide and count columns narrow. Persist these VIEW preferences in the inventory session so they return after pause/reload/resume. These are Count Me view preferences only; do NOT alter original workbook column widths on export unless explicitly requested later.

FOLLOW MODE ARCHITECTURE:
Create clean services/functions equivalent to focusProductRow(rowId), focusCell(rowId,columnId), writeInventoryValue(rowId,columnId,value), clearInventoryValue(rowId,columnId). focusCell must automatically scroll target row into view, briefly highlight the whole row, strongly highlight the exact target cell, show the new value immediately, then fade highlight after about 1–2 seconds. This is required for future voice control.

MANUAL CONTROL:
Inventory cells remain directly editable. User manual correction always wins. Prepare state machine: RUNNING, PAUSED, PAUSED_BY_USER, COMPLETED. If future automation is running and user taps/clicks/edits a spreadsheet cell, switch immediately to PAUSED_BY_USER. Do not automatically revert manual corrections.

FILE SAFETY:
Keep original uploaded workbook recoverable. Working copy receives edits. Later export must create a new .xlsx. Preserve worksheet names, formulas, existing values, number formats, row/column order, merged cells, hidden rows/columns and formatting where supported. Never replace formulas with static values.

RESPONSIVE MOBILE:
Do not simply shrink desktop. Maximize spreadsheet viewport, make cells touch-friendly, preserve horizontal scrolling and fast vertical scrolling, and keep product/unit identity visible. Column resizing should work on desktop and, where practical, via touch on mobile.

INITIAL LABELS: Excel Yükle, Envantere Başla, Kaydedildi, Duraklat, Devam Et, Geri Al, Envanteri Bitir.

ACCEPTANCE TESTS BEFORE STOPPING:
- Upload a real .xlsx successfully.
- Render real spreadsheet data.
- 600+ rows scroll smoothly.
- Horizontal scrolling works.
- Numeric cells are directly editable.
- Product-name and count columns can be resized.
- Auto Fit and Reset View work.
- Reload/resume restores view settings.
- focusCell() demo/test auto-scrolls and highlights correct target cell.
- Original uploaded workbook remains untouched.
- Mobile layout is usable.

Use Lovable's normal full-stack architecture and choose robust libraries appropriate for XLSX parsing/writing and a virtualized editable grid. Do not just mock the UI: implement the working foundation. When all acceptance tests pass, STOP and report limitations. Do not proceed to voice/AI until explicitly requested.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/cc53010a-c23a-4422-93c0-af1c8dc16f69).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
