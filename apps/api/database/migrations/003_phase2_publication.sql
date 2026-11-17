CREATE TABLE website_drafts (
 restaurant_id uuid PRIMARY KEY REFERENCES restaurants(id) ON DELETE CASCADE,
 version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
 content jsonb NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE media_assets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), restaurant_id uuid NOT NULL REFERENCES restaurants(id),
 object_key text NOT NULL UNIQUE, alt text NOT NULL, width integer NOT NULL CHECK(width > 0), height integer NOT NULL CHECK(height > 0),
 bytes integer NOT NULL CHECK(bytes > 0), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(restaurant_id,id)
);
CREATE INDEX media_tenant ON media_assets(restaurant_id,created_at);
CREATE TABLE website_revisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), restaurant_id uuid NOT NULL REFERENCES restaurants(id),
 draft_version integer NOT NULL, content jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(restaurant_id,id), UNIQUE(restaurant_id,draft_version)
);
CREATE TABLE website_publications (
 restaurant_id uuid PRIMARY KEY REFERENCES restaurants(id), revision_id uuid NOT NULL,
 published_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(restaurant_id,revision_id) REFERENCES website_revisions(restaurant_id,id)
);
CREATE TABLE publication_assets (
 restaurant_id uuid NOT NULL, revision_id uuid NOT NULL, asset_id uuid NOT NULL,
 PRIMARY KEY(revision_id,asset_id),
 FOREIGN KEY(restaurant_id,revision_id) REFERENCES website_revisions(restaurant_id,id) ON DELETE CASCADE,
 FOREIGN KEY(restaurant_id,asset_id) REFERENCES media_assets(restaurant_id,id)
);
CREATE TABLE menu_categories (
 restaurant_id uuid NOT NULL REFERENCES restaurants(id), id uuid NOT NULL, name text NOT NULL,
 PRIMARY KEY(restaurant_id,id), UNIQUE(restaurant_id,name)
);
CREATE TABLE menu_items (
 restaurant_id uuid NOT NULL REFERENCES restaurants(id), id uuid NOT NULL, category_id uuid NOT NULL, price bigint NOT NULL CHECK(price>=0), currency varchar(3) NOT NULL,
 PRIMARY KEY(restaurant_id,id), FOREIGN KEY(restaurant_id,category_id) REFERENCES menu_categories(restaurant_id,id)
);
CREATE TABLE item_availability (
 restaurant_id uuid NOT NULL, item_id uuid NOT NULL, content jsonb NOT NULL,
 PRIMARY KEY(restaurant_id,item_id), FOREIGN KEY(restaurant_id,item_id) REFERENCES menu_items(restaurant_id,id)
);
CREATE TABLE menu_price_history (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, restaurant_id uuid NOT NULL, item_id uuid NOT NULL,
 price bigint NOT NULL CHECK(price>=0), currency varchar(3) NOT NULL, configuration jsonb NOT NULL, changed_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(restaurant_id,item_id) REFERENCES menu_items(restaurant_id,id)
);
CREATE INDEX price_history_tenant ON menu_price_history(restaurant_id,item_id,changed_at);
CREATE FUNCTION immutable_website_revision() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Publication revisions are immutable'; END $$;
CREATE TRIGGER website_revision_immutable BEFORE UPDATE OR DELETE ON website_revisions FOR EACH ROW EXECUTE FUNCTION immutable_website_revision();
-- Existing Phase 1 PATCH must not bypass currency protection.
CREATE FUNCTION protect_menu_currency() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.currency <> OLD.currency AND EXISTS(SELECT 1 FROM menu_items WHERE restaurant_id=OLD.id) THEN
 RAISE EXCEPTION 'Currency cannot change after menu prices exist' USING ERRCODE='23514'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER protect_restaurant_currency BEFORE UPDATE OF currency ON restaurants FOR EACH ROW EXECUTE FUNCTION protect_menu_currency();
