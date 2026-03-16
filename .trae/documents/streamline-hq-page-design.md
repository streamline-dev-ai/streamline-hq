# Streamline HQ — Page Design Specification (Desktop-first)

## Global Styles (All Pages)
- Layout system: CSS Grid for app shell (sidebar + main), Flexbox for toolbars/forms.
- Design tokens:
  - Background: #0B1220 (app) / #0F172A (cards)
  - Text: #E5E7EB primary, #94A3B8 secondary
  - Accent: #3B82F6 (primary), #22C55E (success), #F59E0B (warning), #EF4444 (danger)
  - Radius: 12px cards, 10px inputs; Shadow: subtle elevated cards
  - Typography: 14px base, 12px meta, 18–24px section titles, 28–32px page title
- Buttons/links:
  - Primary button: accent fill + 600 weight; hover: +6% brightness
  - Secondary: outline + subtle bg on hover
  - Links: accent text, underline on hover
- Responsive behavior:
  - >=1024px: persistent left sidebar
  - 640–1023px: collapsible sidebar (hamburger)
  - <640px: top app bar + drawer nav; tables become stacked cards

## App Shell (Shared)
### Layout
- Grid: [Sidebar 260px] + [Main auto]; main contains top bar + content.
- Safe-area padding for mobile; consistent 24px desktop gutters.

### Components
- Sidebar nav: product name “Streamline HQ”, primary routes, active highlight.
- Top bar: page title, search (optional if present), user menu (avatar, sign out).
- Realtime indicator: small dot + “Live” label; shows disconnected state.
- Toast system: success/error notifications (e.g., “Stock updated”).

---

## Page: Login
### Meta Information
- Title: Streamline HQ — Sign in
- Description: Sign in to access your Streamline HQ workspace.

### Structure
- Centered auth card (max-width 420px) on branded background.

### Sections & Components
- Header: logo/name + short subtitle.
- Form: email, password, “Sign in” button.
- Secondary actions: “Forgot password” link; inline error text.

---

## Page: Dashboard (Overview)
### Meta Information
- Title: Streamline HQ — Overview
- Description: Live KPIs and recent activity.

### Structure
- Stacked sections: KPI grid → activity + quick panels.

### Sections & Components
- KPI cards (grid 2–4 columns depending on width): Open Orders, Low Stock, Total Customers, Revenue/Total (if available).
- Activity feed (card): chronological events (who/what/when), realtime append.
- Quick links (card row): buttons to Orders / Inventory / Customers.

Interaction states
- Skeleton loading for KPIs; empty state for feed.

---

## Page: Orders
### Meta Information
- Title: Streamline HQ — Orders
- Description: View and update orders.

### Structure
- Two-pane desktop: list (left) + detail (right). On mobile: list → detail drill-in.

### Sections & Components
- Filters row: status dropdown, date range (simple), search.
- Orders list: sortable table; status pill; updated-at.
- Order detail: summary header, customer block, line items table, status update control.

---

## Page: Inventory
### Meta Information
- Title: Streamline HQ — Inventory
- Description: Track stock and low-stock items.

### Structure
- Main table/card list with right-side detail drawer on desktop.

### Sections & Components
- Inventory list: product name/SKU, on-hand, reorder point, low-stock highlight.
- Stock adjust: +/- stepper or input + “Save”, requires confirmation.
- Low-stock panel: compact list sorted by urgency.

---

## Page: Customers
### Meta Information
- Title: Streamline HQ — Customers
- Description: Manage customer records.

### Structure
- List + detail (same responsive pattern as Orders).

### Sections & Components
- Search bar (name/email).
- Customer list: name, email, phone, created date.
- Customer detail: editable fields, save/cancel; recent orders list (read-only).

---

## Page: Settings
### Meta Information
- Title: Streamline HQ — Settings
- Description: Workspace preferences and app installation.

### Structure
- Settings tabs/sections: Profile → Workspace → Members → App (PWA).

### Sections & Components
- Profile: email display, role badge, sign out.
- Workspace: org name display/edit (Admin).
- Members: invite by email (Admin), list members, remove member action.
- PWA install: detect installability; show “Install App” button (when available) and instructions for iOS/Android/desktop.