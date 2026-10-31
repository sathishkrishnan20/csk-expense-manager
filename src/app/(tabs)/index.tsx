import { HomeView } from "../../ui/HomeView";
import { MAIN_GROUP_ID } from "../../domain/groups";

export default function Home() {
  return <HomeView groupId={MAIN_GROUP_ID} />;
}
