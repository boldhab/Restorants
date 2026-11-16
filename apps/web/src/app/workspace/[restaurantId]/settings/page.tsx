import { Workspace } from '../../../../features/workspace/workspace';
export default async function Page({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  return <Workspace key={restaurantId} restaurantId={restaurantId} settings={true} />;
}
