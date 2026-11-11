import { WithAddButton } from "../ui/AddMenu";
import { HomeView } from "../ui/HomeView";
import { useHomeGroup } from "../ui/useHomeGroup";

// The group chosen as Home (Main unless the owner chose another on the Groups page). The Ask AI button floats above the + button.
export default function Home() {
  const home = useHomeGroup();
  return home ? (
    <WithAddButton askAi>
      <HomeView groupId={home.id} />
    </WithAddButton>
  ) : null;
}
