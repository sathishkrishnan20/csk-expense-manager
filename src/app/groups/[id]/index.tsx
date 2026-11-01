import { useRouter } from "expo-router";
import { useGroupActions } from "../../../ui/GroupHeader";
import { HomeView } from "../../../ui/HomeView";
import { useRouteGroupId } from "../../../ui/useRouteGroupId";

// The group's overview has no title bar: like Main's Home it is the purple block, with a back button and an
// options button where Main has its wallet icon.
export default function GroupHome() {
  const id = useRouteGroupId();
  const router = useRouter();
  const { group, openMenu, sheet } = useGroupActions(id);
  return (
    <>
      <HomeView groupId={id} groupBar={{ name: group?.name ?? "", onBack: () => router.navigate("/groups"), onMenu: openMenu }} />
      {sheet}
    </>
  );
}
