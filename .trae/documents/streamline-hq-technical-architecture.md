## 1.Architecture design
```mermaid
graph TD
  A["User Browser"] --> B["React Frontend (Streamline HQ)"]
  B --> C["Supabase JS SDK"]
  C --> D["Supabase Auth"]
  C --> E["Supabase Postgres (Tables)"]
  C --> F["Supabase Realtime (Subscriptions)"]
  B --> G["PWA Service Worker + Web App Manifest"]

  subgraph "Frontend Layer"
    B
    G
  end

  subgraph "Service Layer (Provided by Supabase)"
    D
    E
    F
  end
```

## 2.Technology Description
- Frontend: React@18 + TypeScript + vite + tailwindcss@3
- Backend: None (frontend uses Supabase SDK directly)
- BaaS: Supabase (Auth, Postgres, Realtime)
- PWA: Workbox (or Vite PWA plugin) for service worker + caching

## 3.Route definitions
| Route | Purpose |
|-------|---------|
| /login | Authenticate user (Supabase Auth) |
| / | Dashboard overview KPIs + activity feed |
| /orders | Orders list + order detail navigation |
| /inventory | Inventory list + stock adjustments |
| /customers | Customers list + customer detail |
| /settings | Workspace/profile/members + PWA install help |

## 6.Data model(if applicable)

### 6.1 Data model definition
```mermaid
erDiagram
  ORGANIZATIONS {
    uuid id PK
    text name
    timestamptz created_at
  }
  PROFILES {
    uuid id PK
    uuid org_id
    text email
    text role
    timestamptz created_at
  }
  CUSTOMERS {
    uuid id PK
    uuid org_id
    text name
    text email
    text phone
    timestamptz created_at
  }
  PRODUCTS {
    uuid id PK
    uuid org_id
    text name
    text sku
    int reorder_point
    timestamptz created_at
  }
  INVENTORY {
    uuid id PK
    uuid org_id
    uuid product_id
    int on_hand
    timestamptz updated_at
  }
  ORDERS {
    uuid id PK
    uuid org_id
    uuid customer_id
    text status
    numeric total
    timestamptz created_at
    timestamptz updated_at
  }
  ORDER_ITEMS {
    uuid id PK
    uuid org_id
    uuid order_id
    uuid product_id
    int quantity
    numeric unit_price
  }
  ACTIVITY_EVENTS {
    uuid id PK
    uuid org_id
    text entity_type
    uuid entity_id
    text action
    jsonb meta
    timestamptz created_at
  }

  ORGANIZATIONS ||--o{ PROFILES : has
  ORGANIZATIONS ||--o{ CUSTOMERS : owns
  ORGANIZATIONS ||--o{ PRODUCTS : owns
  ORGANIZATIONS ||--o{ INVENTORY : tracks
  ORGANIZATIONS ||--o{ ORDERS : owns
  ORDERS ||--o{ ORDER_ITEMS : contains
```

### 6.2 Data Definition Language
Organizations (organizations)
```sql
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- basic grants (extend with RLS in Supabase)
GRANT SELECT ON organizations TO anon;
GRANT ALL PRIVILEGES ON organizations TO authenticated;
```

Profiles (profiles) — maps to auth.users via same id
```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY,
  org_id UUID NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','staff')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON profiles TO anon;
GRANT ALL PRIVILEGES ON profiles TO authenticated;
```

Operational tables (customers, products, inventory, orders, order_items, activity_events)
```sql
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  name TEXT NOT NULL,
  sku TEXT,
  reorder_point INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  product_id UUID NOT NULL,
  on_hand INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  customer_id UUID,
  status TEXT NOT NULL,
  total NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  order_id UUID NOT NULL,
  product_id UUID,
  quantity INT NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL DEFAULT 0
);

CREATE TABLE activity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  action TEXT NOT NULL,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON customers, products, inventory, orders, order_items, activity_events TO anon;
GRANT ALL PRIVILEGES ON customers, products, inventory, orders, order_items, activity_events TO authenticated;
```

Realtime subscriptions
- Subscribe to INSERT/UPDATE on: orders, inventory, activity_events.
- Use org_id filter in queries and channel filters to limit events per workspace.