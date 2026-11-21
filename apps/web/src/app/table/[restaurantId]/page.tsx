import { TableEntry } from '../../../features/operations/table-entry';
export const metadata = { robots: { index: false, follow: false }, referrer: 'no-referrer' };
export default async function Page({ params }: { params: Promise<{ restaurantId: string }> }) {
  return <TableEntry restaurantId={(await params).restaurantId} />;
}
