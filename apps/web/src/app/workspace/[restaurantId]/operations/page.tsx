import { Operations } from '../../../../features/commerce/operations';
export default async function Page({ params }: { params: Promise<{ restaurantId: string }> }) {
  return (
    <Operations key={(await params).restaurantId} restaurantId={(await params).restaurantId} />
  );
}
