export const metadata = { robots: { index: false, follow: false } };
import { RestaurantSelection } from '../../features/restaurants/selection';
export default function Page() {
  return <RestaurantSelection />;
}
