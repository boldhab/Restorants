CREATE TABLE platform_administrators (
 user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 assigned_by UUID REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO platform_administrators(user_id) SELECT id FROM users WHERE is_platform_admin ON CONFLICT DO NOTHING;
ALTER TABLE restaurants ADD CONSTRAINT restaurant_slug_normalized CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
ALTER TABLE restaurants ADD CONSTRAINT restaurant_status_valid CHECK (status IN ('onboarding','active','suspended','archived'));
CREATE UNIQUE INDEX one_default_branch ON branches(restaurant_id) WHERE is_default;
-- Global roles are immutable templates. Custom restaurant roles must match the membership tenant.
CREATE FUNCTION check_membership_role_tenant() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE role_tenant UUID; member_tenant UUID;
BEGIN
 SELECT restaurant_id INTO role_tenant FROM roles WHERE id = NEW.role_id;
 SELECT restaurant_id INTO member_tenant FROM restaurant_memberships WHERE id = NEW.membership_id;
 IF role_tenant IS NOT NULL AND role_tenant IS DISTINCT FROM member_tenant THEN
  RAISE EXCEPTION 'Role and membership must share restaurant' USING ERRCODE = '23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER membership_role_tenant BEFORE INSERT OR UPDATE ON membership_roles FOR EACH ROW EXECUTE FUNCTION check_membership_role_tenant();
CREATE FUNCTION prevent_role_tenant_move() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.restaurant_id IS DISTINCT FROM OLD.restaurant_id THEN RAISE EXCEPTION 'Tenant ownership is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER role_tenant_immutable BEFORE UPDATE OF restaurant_id ON roles FOR EACH ROW EXECUTE FUNCTION prevent_role_tenant_move();
CREATE TRIGGER membership_tenant_immutable BEFORE UPDATE OF restaurant_id ON restaurant_memberships FOR EACH ROW EXECUTE FUNCTION prevent_role_tenant_move();
-- Required RBAC is release data, independent of development demo seeds.
INSERT INTO permissions(code, description, module) VALUES
 ('restaurant:read','View restaurant','restaurant'), ('restaurant:update','Update restaurant','restaurant'),
 ('workspace:access','Open workspace','workspace'), ('branch:manage','Manage branches','branches'),
 ('staff:manage','Manage staff','staff'), ('settings:update','Update settings','settings'), ('restaurant:delete','Archive restaurant','restaurant') ON CONFLICT DO NOTHING;
INSERT INTO roles(name,description,is_system) VALUES ('owner','Restaurant owner',true),('manager','Restaurant manager',true),('staff','Restricted member',true) ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id) SELECT r.id,p.id FROM roles r CROSS JOIN permissions p WHERE r.restaurant_id IS NULL AND (r.name='owner' OR (r.name='manager' AND p.code <> 'restaurant:delete') OR (r.name='staff' AND p.code IN ('restaurant:read','workspace:access'))) ON CONFLICT DO NOTHING;
