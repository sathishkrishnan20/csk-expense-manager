import { useLocalSearchParams, useRouter } from "expo-router";
import { useGroupActions } from "../../../ui/GroupHeader";
import { HomeView } from "../../../ui/HomeView";

// The group's overview has no title bar: like Main's Home it is the purple block, with a back button and an
// options button where Main has its wallet icon.
export default function GroupHome() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { group, openMenu, sheet } = useGroupActions(id);
  return (
    <>
      <HomeView groupId={id} groupBar={{ name: group?.name ?? "", onBack: () => router.navigate("/groups"), onMenu: openMenu }} />
      {sheet}
    </>
  );
}
