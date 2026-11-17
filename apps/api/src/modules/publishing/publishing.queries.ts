// Parameterized persistence operations used by the publishing repository.
export const publishingQueries = {
  selectMediaAssets: 'SELECT id FROM media_assets WHERE restaurant_id=$1 AND id=ANY($2::uuid[])',
  selectWebsitePublications:
    'SELECT revision_id,published_at,v.draft_version FROM website_publications p JOIN website_revisions v ON v.id=p.revision_id WHERE p.restaurant_id=$1',
  selectWebsiteRevisions:
    'SELECT id,draft_version,created_at FROM website_revisions WHERE restaurant_id=$1 ORDER BY created_at DESC LIMIT 50',
  selectMenuItems: 'SELECT id,price,currency FROM menu_items WHERE restaurant_id=$1',
  selectMenuCategories: 'SELECT id FROM menu_categories WHERE restaurant_id=$1',
  updateMenuCategories: 'UPDATE menu_categories SET name=id::text WHERE restaurant_id=$1',
  insertMenuCategories:
    'INSERT INTO menu_categories(restaurant_id,id,name) VALUES($1,$2,$3) ON CONFLICT(restaurant_id,id) DO UPDATE SET name=excluded.name',
  insertMenuItems:
    'INSERT INTO menu_items(restaurant_id,id,category_id,price,currency) VALUES($1,$2,$3,$4,$5) ON CONFLICT(restaurant_id,id) DO UPDATE SET category_id=excluded.category_id,price=excluded.price,currency=excluded.currency',
  insertMenuPriceHistory:
    'INSERT INTO menu_price_history(restaurant_id,item_id,price,currency,configuration) VALUES($1,$2,$3,$4,$5)',
  updateRestaurants:
    'UPDATE restaurants SET name=$2,category=$3,phone=$4,email=$5,address=$6,timezone=$7,currency=$8,updated_at=now() WHERE id=$1',
  updateWebsiteDrafts:
    'UPDATE website_drafts SET content=$2,version=version+1,updated_at=now() WHERE restaurant_id=$1',
  insertWebsiteRevisions:
    'INSERT INTO website_revisions(restaurant_id,draft_version,content) VALUES($1,$2,$3) ON CONFLICT(restaurant_id,draft_version) DO NOTHING RETURNING id',
  selectWebsiteRevisions2:
    'SELECT id FROM website_revisions WHERE restaurant_id=$1 AND draft_version=$2',
  insertPublicationAssets:
    'INSERT INTO publication_assets(restaurant_id,revision_id,asset_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
  insertWebsitePublications:
    'INSERT INTO website_publications(restaurant_id,revision_id) VALUES($1,$2) ON CONFLICT(restaurant_id) DO UPDATE SET revision_id=excluded.revision_id,published_at=now()',
  insertAuditLogs:
    "INSERT INTO audit_logs(actor_id,restaurant_id,action,target_type,target_id) VALUES($1,$2,'website.published','revision',$3)",
  deleteWebsitePublications: 'DELETE FROM website_publications WHERE restaurant_id=$1',
  insertAuditLogs2:
    "INSERT INTO audit_logs(actor_id,restaurant_id,action) VALUES($1,$2,'website.unpublished')",
  selectMenuItems2: 'SELECT 1 FROM menu_items WHERE restaurant_id=$1 AND id=$2',
  insertItemAvailability:
    'INSERT INTO item_availability(restaurant_id,item_id,content) VALUES($1,$2,$3) ON CONFLICT(restaurant_id,item_id) DO UPDATE SET content=excluded.content',
  selectItemAvailability: 'SELECT item_id,content FROM item_availability WHERE restaurant_id=$1',
  selectMediaAssets2:
    'SELECT id,alt,width,height FROM media_assets WHERE restaurant_id=$1 AND id=ANY($2::uuid[])',
  insertMediaAssets:
    'INSERT INTO media_assets(restaurant_id,object_key,alt,width,height,bytes) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,alt,width,height,bytes',
  selectPublicationAssets:
    'SELECT 1 FROM publication_assets WHERE restaurant_id=$1 AND asset_id=$2',
  deleteMediaAssets:
    'DELETE FROM media_assets WHERE restaurant_id=$1 AND id=$2 RETURNING object_key',
  selectMediaAssets3: 'SELECT object_key FROM media_assets WHERE restaurant_id=$1 AND id=$2',
  selectMediaAssets4:
    "SELECT a.object_key FROM media_assets a JOIN publication_assets pa ON pa.asset_id=a.id JOIN website_publications p ON p.revision_id=pa.revision_id JOIN restaurants r ON r.id=p.restaurant_id WHERE a.id=$1 AND r.slug=$2 AND r.status IN ('active','onboarding')",
} as const;
