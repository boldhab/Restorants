import { pool } from '../src/database/pool.js';
import { env } from '../src/config/env.js';
import { logger } from '../src/config/logger.js';
import { readDraft, saveDraft, publish } from '../src/modules/publishing/publishing.service.js';
import { uploadImage } from '../src/modules/publishing/media.service.js';

if (!['development', 'test'].includes(env.NODE_ENV)) {
  logger.error('Refusing to run demo seed outside development/test!');
  process.exit(1);
}

// Curated high quality food photography from Unsplash
const RESTAURANT_IMAGES: Record<
  string,
  {
    cover: { url: string; alt: string };
    dishes: Record<string, { url: string; alt: string }>;
  }
> = {
  'bella-italia': {
    cover: {
      url: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=1200&auto=format&fit=crop&q=80',
      alt: 'Bella Italia cozy Italian dining room and bar',
    },
    dishes: {
      'Bruschetta al Pomodoro': {
        url: 'https://images.unsplash.com/photo-1572695157366-5e585ab2b69f?w=800&auto=format&fit=crop&q=80',
        alt: 'Crispy toasted bruschetta with ripe tomatoes, basil and olive oil',
      },
      'Crispy Calamari Fritti': {
        url: 'https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?w=800&auto=format&fit=crop&q=80',
        alt: 'Golden crispy calamari fritti with lemon and marinara sauce',
      },
      'Handmade Truffle Gnocchi': {
        url: 'https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=800&auto=format&fit=crop&q=80',
        alt: 'Handmade potato gnocchi with creamy black truffle sauce and mushrooms',
      },
      'Tagliatelle alla Bolognese': {
        url: 'https://images.unsplash.com/photo-1598866594230-a7c12756260f?w=800&auto=format&fit=crop&q=80',
        alt: 'Fresh tagliatelle pasta tossed in rich slow-simmered bolognese meat sauce',
      },
      'Demo · Garden pasta': {
        url: 'https://images.unsplash.com/photo-1608897013039-887f21d8c804?w=800&auto=format&fit=crop&q=80',
        alt: 'Garden vegetable pasta with fresh basil and cherry tomatoes',
      },
      'Diavola Spicy Salami Pizza': {
        url: 'https://images.unsplash.com/photo-1628840042765-356cda07504e?w=800&auto=format&fit=crop&q=80',
        alt: 'Wood-fired spicy diavola pizza with Calabrian salumi and melted mozzarella',
      },
      'Margherita D.O.P.': {
        url: 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=800&auto=format&fit=crop&q=80',
        alt: 'Classic Neapolitan pizza Margherita with San Marzano tomatoes, fresh mozzarella and basil',
      },
      'Classic Venetian Tiramisù': {
        url: 'https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=800&auto=format&fit=crop&q=80',
        alt: 'Layered Venetian tiramisu dusted with dark cocoa powder',
      },
      'Sicilian Cannoli Duo': {
        url: 'https://images.unsplash.com/photo-1551504734-5ee1c4a1479b?w=800&auto=format&fit=crop&q=80',
        alt: 'Crispy Sicilian cannoli filled with sweet ricotta cream and crushed pistachios',
      },
    },
  },

  'tokyo-ramen': {
    cover: {
      url: 'https://images.unsplash.com/photo-1552611052-33e04de081de?w=1200&auto=format&fit=crop&q=80',
      alt: 'Tokyo Ramen bar counter with steaming bowls of ramen',
    },
    dishes: {
      'Pan-Fried Pork Gyoza (6 pcs)': {
        url: 'https://images.unsplash.com/photo-1498654896293-37aacf113fd9?w=800&auto=format&fit=crop&q=80',
        alt: 'Pan-fried Japanese pork gyoza dumplings with crispy bottoms',
      },
      'Japanese Chicken Karaage': {
        url: 'https://images.unsplash.com/photo-1562967914-608f82629710?w=800&auto=format&fit=crop&q=80',
        alt: 'Crispy golden Japanese chicken karaage with lemon',
      },
      'Tonkotsu Black Garlic Ramen': {
        url: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=800&auto=format&fit=crop&q=80',
        alt: 'Rich tonkotsu ramen with chashu pork belly, ajitsuke egg, and black garlic oil',
      },
      'Spicy Sesame Tan Tan Men': {
        url: 'https://images.unsplash.com/photo-1614563637806-1d0e645e0940?w=800&auto=format&fit=crop&q=80',
        alt: 'Spicy sesame tan tan ramen with chili oil and minced pork',
      },
      'Demo · Miso ramen': {
        url: 'https://images.unsplash.com/photo-1557872943-16a5ac26437e?w=800&auto=format&fit=crop&q=80',
        alt: 'Hearty Sapporo-style miso ramen with sweet corn and scallions',
      },
      'Chashu Pork Belly Donburi': {
        url: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&auto=format&fit=crop&q=80',
        alt: 'Torched chashu pork belly over warm steamed rice bowl',
      },
      'Chicken Katsu Japanese Curry': {
        url: 'https://images.unsplash.com/photo-1604382354936-07c5d9983bd3?w=800&auto=format&fit=crop&q=80',
        alt: 'Golden panko chicken katsu served with Japanese curry and rice',
      },
      'Uji Matcha Green Tea Ice Cream': {
        url: 'https://images.unsplash.com/photo-1505394033641-40c6ad1178d7?w=800&auto=format&fit=crop&q=80',
        alt: 'Kyoto Uji matcha green tea ice cream scoop with sweet red bean paste',
      },
      'Sparkling Yuzu Citrus Soda': {
        url: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=800&auto=format&fit=crop&q=80',
        alt: 'Sparkling Japanese yuzu citrus soda with mint and ice',
      },
    },
  },

  'le-petit-bistro': {
    cover: {
      url: 'https://images.unsplash.com/photo-1550966871-3ed3cdb5ed0c?w=1200&auto=format&fit=crop&q=80',
      alt: 'Charming French bistro interior with warm ambient lighting',
    },
    dishes: {
      'Soupe à l’Oignon Gratinée': {
        url: 'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=800&auto=format&fit=crop&q=80',
        alt: 'Traditional French onion soup crock with melted Gruyere cheese crust',
      },
      'Escargots de Bourgogne': {
        url: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=800&auto=format&fit=crop&q=80',
        alt: 'Burgundy escargots bubbling in fragrant garlic herb butter',
      },
      'Canard Confit à l’Orange': {
        url: 'https://images.unsplash.com/photo-1518492104633-130d0cc84637?w=800&auto=format&fit=crop&q=80',
        alt: 'Crispy pan-roasted duck leg confit with savory glaze',
      },
      'Coq au Vin Traditionnel': {
        url: 'https://images.unsplash.com/photo-1598515214211-89d3c73ae83b?w=800&auto=format&fit=crop&q=80',
        alt: 'Classic French coq au vin braised chicken in red wine sauce with pearl onions',
      },
      'Demo · Steak frites': {
        url: 'https://images.unsplash.com/photo-1600891964599-f61ba0e24092?w=800&auto=format&fit=crop&q=80',
        alt: 'Pan-seared prime beef ribeye steak with golden French fries and herb butter',
      },
      'Crème Brûlée à la Vanille de Madagascar': {
        url: 'https://images.unsplash.com/photo-1470124182917-cc6e71b22ecc?w=800&auto=format&fit=crop&q=80',
        alt: 'Vanilla bean crème brûlée with crisp caramelized sugar top',
      },
      'Moelleux au Chocolat Valrhona': {
        url: 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=800&auto=format&fit=crop&q=80',
        alt: 'Warm Valrhona chocolate molten lava cake with flowing center',
      },
    },
  },

  'taco-fiesta': {
    cover: {
      url: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=1200&auto=format&fit=crop&q=80',
      alt: 'Vibrant Mexican fiesta dining spread with tacos, chips and salsas',
    },
    dishes: {
      'Fresh Guacamole & Warm House Chips': {
        url: 'https://images.unsplash.com/photo-1541288097308-7b8e3f58c4c6?w=800&auto=format&fit=crop&q=80',
        alt: 'Freshly mashed chunky guacamole with lime, cilantro and tortilla chips',
      },
      'Street Corn Elote en Vaso': {
        url: 'https://images.unsplash.com/photo-1551504734-5ee1c4a1479b?w=800&auto=format&fit=crop&q=80',
        alt: 'Mexican street corn elote cup with cotija cheese, chili and lime',
      },
      'Tacos Al Pastor (Trio)': {
        url: 'https://images.unsplash.com/photo-1551504734-5ee1c4a1479b?w=800&auto=format&fit=crop&q=80',
        alt: 'Authentic pork al pastor tacos with roasted pineapple and cilantro',
      },
      'Baja Crispy Cod Fish Tacos (Trio)': {
        url: 'https://images.unsplash.com/photo-1552332386-f8dd00dc2f85?w=800&auto=format&fit=crop&q=80',
        alt: 'Crispy beer-battered Baja fish tacos with cabbage slaw and chipotle cream',
      },
      'Demo · Birria tacos': {
        url: 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=800&auto=format&fit=crop&q=80',
        alt: 'Crispy beef birria tacos with melted Oaxaca cheese and consommé dip',
      },
      'Carne Asada Fiesta Plate': {
        url: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=800&auto=format&fit=crop&q=80',
        alt: 'Grilled carne asada skirt steak platter with Mexican rice and beans',
      },
      'Enchiladas Suizas Gratinadas': {
        url: 'https://images.unsplash.com/photo-1534352956036-cd81e27dd615?w=800&auto=format&fit=crop&q=80',
        alt: 'Baked chicken enchiladas suizas smothered in melted cheese and salsa verde',
      },
      'Warm Cinnamon Sugar Churros': {
        url: 'https://images.unsplash.com/photo-1624300629298-e9de39c13be5?w=800&auto=format&fit=crop&q=80',
        alt: 'Golden crispy Mexican churros tossed in cinnamon sugar with chocolate sauce',
      },
      'Traditional Horchata Fresca': {
        url: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=800&auto=format&fit=crop&q=80',
        alt: 'Cold traditional Mexican horchata beverage sprinkled with ground cinnamon',
      },
    },
  },
};

async function downloadBuffer(url: string): Promise<Buffer> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Accept: 'image/webp,image/apng,image/jpeg,image/png,*/*',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  for (const [slug, cfg] of Object.entries(RESTAURANT_IMAGES)) {
    console.log(`\n========================================`);
    console.log(`Ingesting food photos for restaurant: ${slug}`);
    console.log(`========================================`);

    const restRow = (
      await pool.query(
        `SELECT r.id, r.slug, r.name, u.id as owner_id
         FROM restaurants r
         JOIN restaurant_memberships rm ON rm.restaurant_id = r.id
         JOIN users u ON u.id = rm.user_id
         JOIN membership_roles mr ON mr.membership_id = rm.id
         JOIN roles ro ON ro.id = mr.role_id AND ro.name = 'owner'
         WHERE r.slug = $1`,
        [slug]
      )
    ).rows[0];

    if (!restRow) throw new Error(`Restaurant ${slug} not found`);

    const restaurantId = restRow.id;
    const ownerId = restRow.owner_id;

    const draftRes = await readDraft(restaurantId);
    const d = draftRes.draft;

    // 1. Download & upload cover photo
    console.log(`Downloading restaurant cover image...`);
    try {
      const coverBytes = await downloadBuffer(cfg.cover.url);
      const coverAsset = await uploadImage(restaurantId, coverBytes, cfg.cover.alt);
      d.settings.cover = coverAsset.id;
      console.log(`Cover photo uploaded as asset: ${coverAsset.id}`);
    } catch (err: any) {
      console.warn(`Cover photo download failed: ${err.message}. Keeping current cover.`);
    }

    // 2. Download & upload dish photos
    for (const item of d.items) {
      const dishInfo = cfg.dishes[item.name];
      if (!dishInfo) {
        console.log(`No online photo mapped for "${item.name}". Skipping.`);
        continue;
      }

      console.log(`Downloading photo for dish: "${item.name}"...`);
      try {
        const dishBytes = await downloadBuffer(dishInfo.url);
        const dishAsset = await uploadImage(restaurantId, dishBytes, dishInfo.alt);
        item.image = dishAsset.id;
        console.log(`-> "${item.name}" assigned new photo asset: ${dishAsset.id}`);
      } catch (err: any) {
        console.warn(`-> Failed to download photo for "${item.name}": ${err.message}`);
      }
    }

    // 3. Save draft
    console.log(`Saving updated draft with new photo assets...`);
    const saveRes = await saveDraft(restaurantId, draftRes.version, d);
    console.log(`Draft saved as version ${saveRes.version}`);

    // 4. Publish website
    console.log(`Publishing website with new food photos...`);
    const pubRes = await publish(restaurantId, saveRes.version, ownerId);
    console.log(`Published ${slug} successfully (new revision: ${pubRes.revision})`);
  }

  console.log(`\n========================================`);
  console.log(`All real food photos ingested and published!`);
  console.log(`========================================`);
}

main()
  .catch((e) => {
    console.error('Fatal error ingesting food photos:', e);
    process.exit(1);
  })
  .finally(() => pool.end());
