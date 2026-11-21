import { randomUUID } from 'node:crypto';
import { pool } from '../src/database/pool.js';
import { env } from '../src/config/env.js';
import { logger } from '../src/config/logger.js';
import { readDraft, saveDraft, publish } from '../src/modules/publishing/publishing.service.js';
import { q } from '../src/modules/operations/operations.repository.js';
import { withTransaction } from '../src/database/transaction.js';

if (!['development', 'test'].includes(env.NODE_ENV)) {
  logger.error('Refusing to run demo seed outside development/test!');
  process.exit(1);
}

interface NewDish {
  name: string;
  description: string;
  price: number;
  prepMinutes: number;
  featured?: boolean;
  dietary?: string;
  variants?: { name: string; price: number }[];
  modifiers?: { name: string; min: number; max: number; options: { name: string; price: number }[] }[];
}

interface NewCategory {
  name: string;
  description: string;
  dishes: NewDish[];
}

const RICH_MENUS: Record<string, NewCategory[]> = {
  'bella-italia': [
    {
      name: 'Antipasti & Starters',
      description: 'Classic Italian appetizers and sharing plates',
      dishes: [
        {
          name: 'Bruschetta al Pomodoro',
          description: 'Toasted sourdough topped with vine-ripened tomatoes, fresh basil, garlic, and aged balsamic glaze.',
          price: 900,
          prepMinutes: 10,
          featured: true,
          dietary: 'Vegetarian',
          modifiers: [
            {
              name: 'Cheese Add-on',
              min: 0,
              max: 1,
              options: [
                { name: 'Fresh Burrata', price: 300 },
                { name: 'Buffalo Mozzarella', price: 350 },
              ],
            },
          ],
        },
        {
          name: 'Crispy Calamari Fritti',
          description: 'Tender calamari lightly dusted in semolina flour, flash-fried, served with house marinara and lemon wedge.',
          price: 1400,
          prepMinutes: 12,
          featured: false,
          dietary: 'Seafood',
          modifiers: [
            {
              name: 'Sauce Choice',
              min: 0,
              max: 1,
              options: [
                { name: 'Spicy Marinara', price: 100 },
                { name: 'Garlic Herb Aioli', price: 100 },
              ],
            },
          ],
        },
      ],
    },
    {
      name: 'Pasta Specialties',
      description: 'Handcrafted fresh pastas made daily with Italian semolina',
      dishes: [
        {
          name: 'Tagliatelle alla Bolognese',
          description: 'Slow-simmered beef, veal, and pancetta ragù over fresh ribbon egg pasta with 24-month Parmigiano-Reggiano.',
          price: 1800,
          prepMinutes: 18,
          featured: true,
          variants: [
            { name: 'Regular Portion', price: 1800 },
            { name: 'Large Portion', price: 2200 },
          ],
          modifiers: [
            {
              name: 'Extra Topping',
              min: 0,
              max: 1,
              options: [
                { name: 'Extra 24-Month Parmigiano', price: 150 },
                { name: 'Truffle Oil Drizzle', price: 250 },
              ],
            },
          ],
        },
        {
          name: 'Handmade Truffle Gnocchi',
          description: 'Pillow-soft potato gnocchi tossed in a rich black truffle and mascarpone cream sauce with wild mushrooms.',
          price: 2000,
          prepMinutes: 15,
          featured: true,
          dietary: 'Vegetarian',
        },
      ],
    },
    {
      name: 'Wood-Fired Pizza',
      description: 'Traditional Neapolitan pizza baked in our 900-degree stone oven',
      dishes: [
        {
          name: 'Margherita D.O.P.',
          description: 'San Marzano tomato sauce, fior di latte mozzarella, fresh basil, and extra virgin olive oil.',
          price: 1600,
          prepMinutes: 14,
          featured: true,
          dietary: 'Vegetarian',
          variants: [
            { name: '12-inch Traditional', price: 1600 },
            { name: '16-inch Sharing', price: 2100 },
          ],
          modifiers: [
            {
              name: 'Crust Option',
              min: 0,
              max: 1,
              options: [{ name: 'Gluten-Free Cauliflower Crust', price: 300 }],
            },
          ],
        },
        {
          name: 'Diavola Spicy Salami Pizza',
          description: 'Spicy Calabrian salumi, roasted red chili peppers, fresh mozzarella, and hot honey drizzle.',
          price: 1900,
          prepMinutes: 14,
          featured: false,
        },
      ],
    },
    {
      name: 'Dolci & Desserts',
      description: 'Authentic handmade Italian desserts',
      dishes: [
        {
          name: 'Classic Venetian Tiramisù',
          description: 'Espresso-soaked savoiardi ladyfingers layered with rich mascarpone zabaglione and Valrhona cocoa.',
          price: 900,
          prepMinutes: 5,
          featured: true,
          dietary: 'Vegetarian',
        },
        {
          name: 'Sicilian Cannoli Duo',
          description: 'Crispy pastry shells filled with sweet ricotta cream, crushed pistachios, and dark chocolate chips.',
          price: 800,
          prepMinutes: 5,
          dietary: 'Vegetarian',
        },
      ],
    },
  ],

  'tokyo-ramen': [
    {
      name: 'Izakaya Small Bites',
      description: 'Japanese small plates and street appetizers',
      dishes: [
        {
          name: 'Pan-Fried Pork Gyoza (6 pcs)',
          description: 'Crispy pan-fried dumplings filled with pork and napa cabbage, served with sesame soy dipping sauce.',
          price: 850,
          prepMinutes: 8,
          featured: true,
        },
        {
          name: 'Japanese Chicken Karaage',
          description: 'Ginger-garlic marinated bite-sized chicken thighs fried extra crispy, served with Kewpie mayo and lemon.',
          price: 950,
          prepMinutes: 10,
          featured: true,
        },
      ],
    },
    {
      name: 'Artisan Ramen',
      description: 'Simmered broths with fresh artisan craft noodles',
      dishes: [
        {
          name: 'Tonkotsu Black Garlic Ramen',
          description: 'Rich 16-hour pork bone broth, tender chashu pork belly, ajitsuke nitamago egg, scallions, and black garlic oil.',
          price: 1750,
          prepMinutes: 15,
          featured: true,
          variants: [
            { name: 'Standard Bowl', price: 1750 },
            { name: 'Double Chashu Belly', price: 2150 },
          ],
          modifiers: [
            {
              name: 'Noodle Texture',
              min: 0,
              max: 1,
              options: [
                { name: 'Firm Noodles (Katame)', price: 0 },
                { name: 'Soft Noodles (Yawarakame)', price: 0 },
              ],
            },
            {
              name: 'Spice Level',
              min: 0,
              max: 1,
              options: [
                { name: 'Medium Spicy', price: 50 },
                { name: 'Fire Dragon Hot', price: 100 },
              ],
            },
          ],
        },
        {
          name: 'Spicy Sesame Tan Tan Men',
          description: 'Creamy roasted sesame and chili broth with seasoned ground pork, bok choy, and Sichuan pepper.',
          price: 1800,
          prepMinutes: 15,
          featured: false,
        },
      ],
    },
    {
      name: 'Donburi & Rice Bowls',
      description: 'Comforting Japanese rice dishes',
      dishes: [
        {
          name: 'Chashu Pork Belly Donburi',
          description: 'Torched braised pork belly over steamed Koshihikari rice with sweet tare sauce, nori, and pickled ginger.',
          price: 1300,
          prepMinutes: 10,
          featured: false,
        },
        {
          name: 'Chicken Katsu Japanese Curry',
          description: 'Panko-crusted chicken cutlet served with rich house-recipe Japanese brown curry and steamed rice.',
          price: 1500,
          prepMinutes: 15,
          featured: true,
        },
      ],
    },
    {
      name: 'Drinks & Desserts',
      description: 'Refreshing beverages and sweet treats',
      dishes: [
        {
          name: 'Uji Matcha Green Tea Ice Cream',
          description: 'Authentic Kyoto Uji green tea gelato served with sweet red bean paste and mochi balls.',
          price: 600,
          prepMinutes: 5,
          dietary: 'Vegetarian',
        },
        {
          name: 'Sparkling Yuzu Citrus Soda',
          description: 'Natural Japanese yuzu juice with sparkling mineral water and organic cane sugar.',
          price: 500,
          prepMinutes: 3,
        },
      ],
    },
  ],

  'le-petit-bistro': [
    {
      name: 'Entrées & Hors-d’œuvres',
      description: 'Classic French bistro starters and small plates',
      dishes: [
        {
          name: 'Soupe à l’Oignon Gratinée',
          description: 'Traditional French onion soup with caramelized sweet onions, rich beef broth, sourdough crouton, and bubbling Gruyère.',
          price: 1200,
          prepMinutes: 12,
          featured: true,
        },
        {
          name: 'Escargots de Bourgogne',
          description: 'Six wild Burgundy snails baked in garlic parsley butter, served sizzling hot with warm French baguette.',
          price: 1500,
          prepMinutes: 12,
          featured: false,
        },
      ],
    },
    {
      name: 'Plats Principaux',
      description: 'Authentic Parisian bistro main courses',
      dishes: [
        {
          name: 'Coq au Vin Traditionnel',
          description: 'Chicken braised in Burgundy Pinot Noir with pearl onions, cremini mushrooms, and crispy smoked bacon lardon.',
          price: 2600,
          prepMinutes: 20,
          featured: true,
          variants: [
            { name: 'Standard Plate', price: 2600 },
            { name: 'Truffle Mash Upgrade', price: 2900 },
          ],
        },
        {
          name: 'Canard Confit à l’Orange',
          description: 'Slow-cooked crispy duck leg confit served over roasted fingerling potatoes with citrus Grand Marnier reduction.',
          price: 2800,
          prepMinutes: 20,
          featured: true,
        },
      ],
    },
    {
      name: 'Desserts Français',
      description: 'Decadent Parisian pastries and sweets',
      dishes: [
        {
          name: 'Crème Brûlée à la Vanille de Madagascar',
          description: 'Rich Madagascar vanilla bean custard topped with a brittle caramelized turbinado sugar crust.',
          price: 1000,
          prepMinutes: 5,
          featured: true,
          dietary: 'Vegetarian',
        },
        {
          name: 'Moelleux au Chocolat Valrhona',
          description: 'Warm French molten dark chocolate cake with a molten center, served with vanilla bean crème anglaise.',
          price: 1100,
          prepMinutes: 12,
          dietary: 'Vegetarian',
        },
      ],
    },
  ],

  'taco-fiesta': [
    {
      name: 'Antojitos & Appetizers',
      description: 'Crisp tortilla chips and vibrant street starters',
      dishes: [
        {
          name: 'Fresh Guacamole & Warm House Chips',
          description: 'Hand-mashed Hass avocados with fresh lime, jalapeño, pico de gallo, and cotija cheese with house tortilla chips.',
          price: 850,
          prepMinutes: 8,
          featured: true,
          dietary: 'Vegetarian',
          modifiers: [
            {
              name: 'Spice Level',
              min: 0,
              max: 1,
              options: [
                { name: 'Mild', price: 0 },
                { name: 'Extra Spicy Habanero', price: 50 },
              ],
            },
          ],
        },
        {
          name: 'Street Corn Elote en Vaso',
          description: 'Fire-roasted sweet corn off the cob, tossed in chipotle crema, cotija cheese, cilantro, and Tajín chili lime.',
          price: 700,
          prepMinutes: 8,
          dietary: 'Vegetarian',
        },
      ],
    },
    {
      name: 'Taqueria Specialties',
      description: 'Tacos on fresh double corn tortillas with salsa and lime',
      dishes: [
        {
          name: 'Tacos Al Pastor (Trio)',
          description: 'Marinated pork shoulder roasted on the trompo with grilled pineapple, diced onions, cilantro, and salsa verde.',
          price: 1400,
          prepMinutes: 12,
          featured: true,
          variants: [
            { name: '3 Tacos Platter', price: 1400 },
            { name: '4 Tacos Platter', price: 1750 },
          ],
          modifiers: [
            {
              name: 'Salsa',
              min: 0,
              max: 1,
              options: [
                { name: 'Tomatillo Salsa Verde', price: 0 },
                { name: 'Smoky Roasted Chipotle', price: 0 },
              ],
            },
          ],
        },
        {
          name: 'Baja Crispy Cod Fish Tacos (Trio)',
          description: 'Pacific cod in Dos Equis beer batter, crunchy red cabbage slaw, chipotle aioli, and fresh mango pico.',
          price: 1600,
          prepMinutes: 14,
          featured: true,
        },
      ],
    },
    {
      name: 'Especialidades & Mains',
      description: 'Hearty traditional Mexican favorites',
      dishes: [
        {
          name: 'Carne Asada Fiesta Plate',
          description: 'Citrus-marinated grilled prime skirt steak served with charro pinto beans, Mexican rice, guacamole, and warm tortillas.',
          price: 1950,
          prepMinutes: 18,
          featured: true,
        },
        {
          name: 'Enchiladas Suizas Gratinadas',
          description: 'Three corn tortillas filled with shredded chicken tinga, baked in creamy roasted tomatillo salsa and melted Chihuahua cheese.',
          price: 1650,
          prepMinutes: 16,
          featured: false,
        },
      ],
    },
    {
      name: 'Postres & Bebidas',
      description: 'Sweet endings and refreshing Mexican drinks',
      dishes: [
        {
          name: 'Warm Cinnamon Sugar Churros',
          description: 'Four crispy Mexican churros rolled in cinnamon sugar, served with warm cajeta dulce de leche and Mexican chocolate.',
          price: 750,
          prepMinutes: 8,
          dietary: 'Vegetarian',
        },
        {
          name: 'Traditional Horchata Fresca',
          description: 'Authentic house-made sweetened rice milk infused with Ceylon cinnamon sticks and Mexican vanilla.',
          price: 450,
          prepMinutes: 2,
          dietary: 'Vegetarian',
        },
      ],
    },
  ],
};

async function main() {
  for (const [slug, newCategories] of Object.entries(RICH_MENUS)) {
    console.log(`\n=== Expanding Menu for: ${slug} ===`);

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
    const coverImageId = d.settings.cover;

    console.log(`Existing draft has ${d.categories.length} categories, ${d.items.length} items`);

    let currentOrder = d.categories.length;

    for (const catDef of newCategories) {
      const existingCat = d.categories.find(
        (c) => c.name.toLowerCase() === catDef.name.toLowerCase()
      );
      let catId: string;

      if (!existingCat) {
        catId = randomUUID();
        d.categories.push({
          id: catId,
          name: catDef.name,
          description: catDef.description,
          image: coverImageId,
          order: currentOrder++,
          active: true,
        });
      } else {
        catId = existingCat.id;
      }

      for (const dishDef of catDef.dishes) {
        const existingItem = d.items.find(
          (i) => i.name.toLowerCase() === dishDef.name.toLowerCase()
        );
        if (existingItem) continue;

        const itemId = randomUUID();
        d.items.push({
          id: itemId,
          categoryId: catId,
          name: dishDef.name,
          description: dishDef.description,
          image: coverImageId,
          price: dishDef.price,
          preparationMinutes: dishDef.prepMinutes,
          featured: dishDef.featured ?? false,
          dietary: dishDef.dietary ?? 'Freshly prepared daily',
          allergens: 'Ask server for details',
          state: 'active',
          variants: (dishDef.variants ?? []).map((v) => ({
            id: randomUUID(),
            name: v.name,
            price: v.price,
          })),
          modifiers: (dishDef.modifiers ?? []).map((m) => ({
            id: randomUUID(),
            name: m.name,
            min: m.min,
            max: m.max,
            options: m.options.map((o) => ({
              id: randomUUID(),
              name: o.name,
              price: o.price,
              available: true,
            })),
          })),
        });
      }
    }

    console.log(`Updated draft now has ${d.categories.length} categories, ${d.items.length} items`);

    const saveRes = await saveDraft(restaurantId, draftRes.version, d);
    console.log(`Draft saved as version ${saveRes.version}. Publishing new menu...`);

    const pubRes = await publish(restaurantId, saveRes.version, ownerId);
    console.log(`Published ${slug} successfully (new revision: ${pubRes.revision})`);

    // Route newly added items to existing kitchen stations
    await withTransaction(async (c) => {
      const defaultBranch = (await q(c, 'defaultBranch', [restaurantId]))[0];
      if (!defaultBranch) return;

      const stations = await q(c, 'stations', [restaurantId, defaultBranch.id]);
      if (stations.length > 0) {
        const primaryStation = stations[0];
        for (const item of d.items) {
          await q(c, 'route', [restaurantId, defaultBranch.id, item.id, primaryStation.id]);
        }
        console.log(`Routed ${d.items.length} dishes to kitchen station '${primaryStation.name}'`);
      }
    });
  }

  console.log('\n=== All 4 restaurant menus successfully expanded and published! ===');
}

main()
  .catch((e) => {
    console.error('Error expanding menus:', e);
    process.exit(1);
  })
  .finally(() => pool.end());
