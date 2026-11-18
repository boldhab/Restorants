import { CustomerShop } from '../../../../features/commerce/customer-shop';
export const metadata = {
  title: 'Your visit · ZAYQORA',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};
export default async function Page({
  params,
}: {
  params: Promise<{ restaurantId: string; page?: string[] }>;
}) {
  const p = await params;
  return (
    <CustomerShop
      key={p.restaurantId + String(p.page)}
      restaurantId={p.restaurantId}
      page={p.page ?? ['cart']}
    />
  );
}
