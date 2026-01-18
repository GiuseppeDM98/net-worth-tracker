# Session Notes - Sankey Diagrams per Cashflow

**Data**: 2026-01-18
**Obiettivo**: Aggiungere Sankey diagrams per visualizzare flussi Categorie → Sottocategorie nelle pagine cashflow

## Decisioni Chiave

### Libreria
- **Scelta**: @nivo/sankey v0.99.0
- **Rationale**: API pulita, responsive built-in, buona documentazione, ~16k downloads/week
- **Bundle size**: ~150KB (accettabile)

### Architettura
- **Componente riutilizzabile**: `components/cashflow/CashflowSankeyChart.tsx`
- **Gerarchia**: Categorie → Sottocategorie (2 livelli)
- **Posizionamento**: In fondo alle pagine (dopo tutti i chart esistenti)
- **Separazione**: Chart separati per Expenses e Income

### Responsive Strategy
- **Desktop**: Labels outside, 500px height, full data
- **Mobile**: Labels inside, 400px height, top 5 categories + top 3 subcategories/category
- **Rationale**: Prevent overcrowding, match existing "Top 5" pattern

### Data Transformation
- Algoritmo: Map-based aggregation (O(1) performance)
- Missing subcategories: mapping a "Altro" (existing pattern)
- Color strategy: Categorie usano COLORS array, subcategorie derivate da parent (brightness adjustment)

## Implementation Steps

1. ✅ Plan creation & approval
2. ✅ Install @nivo/sankey package
3. ✅ Create SESSION_NOTES.md
4. ✅ Create CashflowSankeyChart.tsx component
5. ✅ Integrate into CurrentYearTab.tsx
6. ✅ Integrate into TotalHistoryTab.tsx
7. ⏳ Testing (desktop, mobile, edge cases) - **User to test in local**

## Files to Create/Modify

### New Files
1. `components/cashflow/CashflowSankeyChart.tsx` (~250-300 LOC)
2. `SESSION_NOTES.md` (this file)

### Modified Files
1. `components/cashflow/CurrentYearTab.tsx` (~25 new lines)
2. `components/cashflow/TotalHistoryTab.tsx` (~25 new lines)
3. `package.json` (auto-updated by npm install)

## Edge Cases Handled

1. **Empty data**: Conditional rendering prevents chart display
2. **Single category**: Still renders (1 cat → N subcat)
3. **Missing subcategories**: Mapped to "Altro"
4. **Very little data**: Min 1 cat + 1 subcat = valid Sankey
5. **Cyclic dependencies**: Structural validation (naturally acyclic)

## Testing Checklist

### Desktop (≥ 640px)
- [ ] Sankey renders at bottom of both tabs
- [ ] Labels Italian, readable outside nodes
- [ ] Tooltips show formatted currency
- [ ] Colors match pie charts
- [ ] Both Expenses/Income charts when data exists

### Mobile (< 640px)
- [ ] Height 400px (no overflow)
- [ ] Top 5 categories shown
- [ ] Labels inside nodes readable
- [ ] No horizontal scroll
- [ ] Touch tooltips work

### Edge Cases
- [ ] Empty data: no chart render
- [ ] Single category: renders correctly
- [ ] Missing subcategories: "Altro" appears
- [ ] Data accuracy: sum validation

## Code Conventions Applied

- **Localization**: Italian UI, English code comments
- **Comments**: Antirez style (function, why, guide)
- **Sign convention**: Math.abs() for expense amounts (stored as negative)
- **Formatters**: Use formatCurrency() from chartService.ts
- **Date helpers**: Use getItalyYear(), getItalyMonthYear() for timezone consistency

## Notes & Observations

- @nivo/sankey does NOT support cyclic dependencies (critical)
- Our data structure is naturally acyclic (Category→Subcategory only)
- Mobile filtering critical for readability
- Color consistency with pie charts helps user recognition
- Pattern follows existing chart implementations (responsive, tooltips, grid layout)

## Timeline

- **Estimated**: 3-4 hours total
- **Breakdown**:
  - Package install: 2 min
  - Component creation: 2-3 hours
  - Integration: 30 min
  - Testing: 1-2 hours

---

## Implementation Summary

### Completed Work

1. **Package Installation**
   - Installed `@nivo/sankey@^0.99.0` successfully
   - Added 31 packages to dependencies
   - 1 low severity vulnerability (non-critical)

2. **Component Creation**
   - Created `components/cashflow/CashflowSankeyChart.tsx` (~350 LOC)
   - Implemented `buildSankeyData()` for data transformation
   - Implemented `deriveSubcategoryColors()` for color inheritance
   - Responsive configuration (desktop vs mobile)
   - Empty state handling
   - Custom tooltip matching existing chart style

3. **CurrentYearTab Integration**
   - Added import at line 45
   - Added 2 Sankey charts at bottom (lines 1333-1351)
   - Conditional rendering for expenses and income
   - Total changes: ~25 new lines

4. **TotalHistoryTab Integration**
   - Added import at line 37
   - Added 2 Sankey charts at bottom (lines 1005-1023)
   - Conditional rendering for expenses and income
   - Total changes: ~25 new lines

### Key Implementation Details

**Data Transformation**:
- Map-based aggregation for O(1) performance
- Missing subcategories mapped to "Altro"
- Mobile filtering: top 5 categories + top 3 subcategories per category
- Color assignment: categories use COLORS array, subcategories derive from parent

**Responsive Design**:
- Desktop: 500px height, labels outside, full data, gradients enabled
- Mobile: 400px height, labels inside, top N filtering, gradients disabled

**Code Conventions Applied**:
- Italian UI text, English code comments (antirez style)
- Math.abs() for expense amounts (sign convention)
- formatCurrency() from chartService.ts
- Conditional rendering (only when data exists)

### Files Modified

1. `package.json` - Added @nivo/sankey dependency
2. `components/cashflow/CashflowSankeyChart.tsx` - NEW (350 LOC)
3. `components/cashflow/CurrentYearTab.tsx` - Added import + 2 charts (~25 lines)
4. `components/cashflow/TotalHistoryTab.tsx` - Added import + 2 charts (~25 lines)
5. `SESSION_NOTES.md` - This file

### Testing Checklist (User to Complete)

**Desktop (≥ 640px)**:
- [ ] Navigate to Cashflow → Anno Corrente
- [ ] Verify "Flusso Spese per Categoria" renders at bottom
- [ ] Verify "Flusso Entrate per Categoria" renders at bottom
- [ ] Check labels are outside nodes and readable
- [ ] Hover tooltips show formatted currency
- [ ] Colors match pie chart colors
- [ ] Navigate to Cashflow → Storico Totale
- [ ] Verify both Sankey charts render with historical data

**Mobile (< 640px)**:
- [ ] Resize window to < 640px (or test on mobile device)
- [ ] Check chart height is 400px (no overflow)
- [ ] Verify only top 5 categories shown
- [ ] Labels inside nodes are readable
- [ ] No horizontal scroll
- [ ] Touch tooltips work

**Edge Cases**:
- [ ] Test with period having no expenses → chart should not render
- [ ] Test with single category → should render correctly
- [ ] Check data accuracy: flow amounts match expense totals

**Browser Console**:
- [ ] No errors in console
- [ ] No warnings from Nivo/React

### Known Issues / Notes

- 1 low severity npm vulnerability detected (non-critical, can be addressed with `npm audit fix`)
- Bundle size increased by ~150KB (@nivo/sankey + dependencies)
- Performance should be good (Map-based aggregation, mobile filtering)

### Next Steps (If Issues Found)

If you encounter issues during testing:
1. Check browser console for errors
2. Verify data structure (expenses should have categoryName, some may have subCategoryName)
3. Test with different date ranges (current year vs all historical data)
4. Test responsive breakpoints (640px is the mobile threshold)
5. Report any visual inconsistencies or performance issues

### Success Criteria Met

✅ Sankey diagrams added to both cashflow tabs
✅ Show Category → Subcategory flows
✅ Separate charts for Expenses and Income
✅ Conditional rendering (only when data exists)
✅ Responsive design (desktop vs mobile configs)
✅ Color consistency with pie charts
✅ Italian UI text, English code comments
✅ Follows antirez comment style
✅ Reusable component (DRY principle)
✅ Handles edge cases (empty data, missing subcategories)

---

**Status**: Implementation complete, ready for user testing
**Last updated**: 2026-01-18

---

## MAJOR REVISION - Budget Flow Sankey (2026-01-18)

### User Feedback & Requirements Change

User requested complete redesign after seeing initial implementation:
- **Original**: Separate charts for Categories → Subcategories
- **New**: Single chart with Income → Budget → Expenses + Savings flow
- **Interactive**: Click-to-drill-down for category details

### New Implementation

**1. Budget Flow Structure (Default View)**:
```
Income Categories → Budget → Expense Categories + Risparmi

Example:
Stipendio (€2000) ─┐
Bonus (€500) ──────┼─→ Budget (€2500) ─┬─→ Affitto (€800)
                                         ├─→ Spesa (€400)
                                         ├─→ Trasporti (€200)
                                         └─→ Risparmi (€1100)
```

**2. Drill-down View**:
- Click any category → shows Category → Subcategories
- Back button → returns to budget view
- Colors derive from parent category

**3. Key Changes**:
- Removed `type` prop (no longer separates income/expenses)
- Added `selectedCategory` state for drill-down tracking
- Added `buildBudgetFlowData()` function for 3-layer flow
- Added `buildDrillDownData()` function for category drill-down
- Added onClick handler for node interactions
- Added Back button in card header when in drill-down mode
- Removed `cat_`/`sub_` prefixes from labels (clean display)
- Savings calculated as `totalIncome - totalExpenses`
- Savings only shown if positive (no negative "debt" node)

**4. Files Modified (Revision)**:
- `CashflowSankeyChart.tsx` - Complete rewrite (~507 LOC, was ~350)
- `CurrentYearTab.tsx` - Replaced 2 charts with 1 (lines 1333-1340)
- `TotalHistoryTab.tsx` - Replaced 2 charts with 1 (lines 1005-1012)

### Implementation Details

**Budget Flow Algorithm**:
1. Aggregate income by category (left nodes)
2. Aggregate expenses by category (right nodes)
3. Calculate savings = income - expenses
4. Create "Budget" center node with total income
5. Build links: Income → Budget, Budget → Expenses + Savings
6. Mobile filtering: top 5 income + top 5 expenses

**Drill-down Algorithm**:
1. Filter expenses for selected category
2. Aggregate by subcategory (missing → "Altro")
3. Derive colors from parent category color
4. Build nodes: Category + Subcategories
5. Build links: Category → Subcategories
6. Mobile filtering: top 8 subcategories

**Interaction Flow**:
1. Default: Budget flow view
2. Click category → Drill-down view + Back button appears
3. Click Back → Return to budget view
4. Budget/Risparmi nodes: non-clickable (no drill-down)

### Testing Checklist (Updated)

**Budget View**:
- [ ] Income categories on left, Budget center, Expenses + Savings on right
- [ ] Labels clean (no cat_/sub_ prefixes)
- [ ] Savings shown only when positive
- [ ] Savings calculated correctly (income - expenses)
- [ ] Budget node shows total income

**Drill-down**:
- [ ] Click category → shows subcategories
- [ ] Back button appears in card header
- [ ] Click Back → returns to budget view
- [ ] Budget/Risparmi nodes non-clickable
- [ ] Subcategory colors derived from parent
- [ ] Title updates to show selected category

**Mobile**:
- [ ] Top 5 income + top 5 expenses in budget view
- [ ] Top 8 subcategories in drill-down view
- [ ] Back button visible and functional
- [ ] No horizontal scroll

**Edge Cases**:
- [ ] No income → empty budget (should handle gracefully)
- [ ] No expenses → only Risparmi on right
- [ ] Negative savings → Risparmi node not shown
- [ ] Category with no subcategories → shows "Altro"
- [ ] Click same category twice → stays in drill-down

---

**Final Status**: Budget flow implementation complete with drill-down, ready for user testing
**Last updated**: 2026-01-18 (revised)
