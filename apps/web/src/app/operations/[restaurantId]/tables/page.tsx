import { OperationsConsole } from '../../../../features/operations/console';
export const metadata = {
  title: 'Tables · ZAYQORA',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};
export default async function Page({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  return <OperationsConsole restaurantId={restaurantId} view="tables" />;
}
