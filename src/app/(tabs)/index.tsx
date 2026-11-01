import { HomeView } from "../../ui/HomeView";
import { useHomeGroup } from "../../ui/useHomeGroup";

// The group chosen as Home (Main unless the owner chose another on the Groups page).
export default function Home() {
  const home = useHomeGroup();
  return home ? <HomeView groupId={home.id} /> : null;
}
