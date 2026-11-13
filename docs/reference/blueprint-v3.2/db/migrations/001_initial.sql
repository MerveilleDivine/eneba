-- Eneba internship demo schema v3. PostgreSQL 14+.
-- THIS IS SOURCE SQL; until executed against a database it is NOT a verified migration.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT users_email_normalized CHECK (email = lower(btrim(email)) AND length(email) >= 3),
  CONSTRAINT users_name_nonempty CHECK (length(btrim(display_name)) > 0)
);

CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash BYTEA NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_expiry_idx ON sessions(user_id, expires_at);

CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  edition TEXT NOT NULL DEFAULT 'Standard' CHECK (length(btrim(edition)) > 0),
  activation_instructions TEXT NOT NULL DEFAULT 'Follow the platform redemption instructions.' CHECK (length(btrim(activation_instructions)) > 0),
  platform TEXT NOT NULL CHECK (platform IN ('steam','xbox','playstation','nintendo','other')),
  region TEXT NOT NULL CHECK (region IN ('global','europe','united-states')),
  cover_url TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true
);
CREATE INDEX products_search_trgm_idx ON products USING GIN (name gin_trgm_ops);
CREATE INDEX products_facets_idx ON products(active, platform, region);

CREATE TABLE sellers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  rating_percent SMALLINT NOT NULL CHECK (rating_percent BETWEEN 0 AND 100)
);

CREATE TABLE offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  seller_id UUID NOT NULL REFERENCES sellers(id) ON DELETE RESTRICT,
  price_cents BIGINT NOT NULL CHECK (price_cents > 0),
  list_price_cents BIGINT,
  active BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT list_price_must_be_higher CHECK (list_price_cents IS NULL OR list_price_cents > price_cents),
  CONSTRAINT one_seller_offer_per_sku UNIQUE (product_id, seller_id)
);
CREATE INDEX offers_product_price_active_idx ON offers(product_id, price_cents) WHERE active;

-- INVENTORY SOURCE OF TRUTH: if key ID is absent from order_items, it is available.
CREATE TABLE digital_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id UUID NOT NULL REFERENCES offers(id) ON DELETE RESTRICT,
  demo_code TEXT NOT NULL UNIQUE CHECK (length(btrim(demo_code)) > 0),
  CONSTRAINT key_id_and_offer_unique UNIQUE (id, offer_id)
);
CREATE INDEX keys_offer_idx ON digital_keys(offer_id, id);

CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  idempotency_key UUID NOT NULL,
  request_fingerprint BYTEA NOT NULL CHECK (octet_length(request_fingerprint) = 32),
  total_cents BIGINT NOT NULL CHECK (total_cents > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT buyer_idempotency_unique UNIQUE (user_id, idempotency_key)
);
CREATE INDEX orders_buyer_recent_idx ON orders(user_id, created_at DESC);

CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  offer_id UUID NOT NULL REFERENCES offers(id) ON DELETE RESTRICT,
  digital_key_id UUID NOT NULL UNIQUE,
  unit_price_cents BIGINT NOT NULL CHECK (unit_price_cents > 0),
  product_name_snapshot TEXT NOT NULL,
  seller_name_snapshot TEXT NOT NULL,
  -- v1 intentionally allows one purchased key per seller offer per order.
  -- When multi-quantity is approved, a new migration removes ONLY this constraint;
  -- key identity/uniqueness and the composite foreign key stay intact.
  CONSTRAINT one_of_each_offer_per_order UNIQUE (order_id, offer_id),
  -- Crucial: purchase cannot reference a key from a DIFFERENT offer.
  CONSTRAINT ordered_key_matches_offer FOREIGN KEY (digital_key_id, offer_id)
      REFERENCES digital_keys(id, offer_id) ON DELETE RESTRICT
);
CREATE INDEX order_items_order_idx ON order_items(order_id);

-- Separate homepage sources, no hardcoded product lists in React.
CREATE TABLE homepage_banners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  headline TEXT NOT NULL,
  subheading TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL,
  link_href TEXT NOT NULL,
  position INTEGER NOT NULL UNIQUE CHECK (position >= 0),
  active BOOLEAN NOT NULL DEFAULT true
);
CREATE TABLE homepage_best_sellers (
  product_id UUID PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  demo_weekly_sales INTEGER NOT NULL CHECK (demo_weekly_sales >= 0)
);
CREATE TABLE homepage_deals (
  offer_id UUID PRIMARY KEY REFERENCES offers(id) ON DELETE CASCADE,
  position INTEGER NOT NULL UNIQUE CHECK (position >= 0)
);
-- All codes in db/seeds MUST be fake and nonredeemable. No real merchant secrets.
