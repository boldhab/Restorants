import { WebsiteEditor } from '../../../../features/website/website-editor';
export const metadata = {
  title: 'Restaurant website · ZAYQORA',
  robots: { index: false, follow: false },
};
export default async function Page({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  return <WebsiteEditor key={restaurantId} restaurantId={restaurantId} />;
}
