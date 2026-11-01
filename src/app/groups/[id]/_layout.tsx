import { Tabs } from "expo-router/js-tabs";
import { Footer } from "../../../ui/Footer";
import { useRouteGroupId } from "../../../ui/useRouteGroupId";

// A group has its own bottom tabs, like Main: overview, transactions and charts, with the same + menu.
export default function GroupTabsLayout() {
  const id = useRouteGroupId();
  return (
    <Tabs backBehavior="history" screenOptions={{ headerShown: false }} tabBar={(props) => <Footer {...props} groupId={id} />}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="transactions" />
      <Tabs.Screen name="charts" />
    </Tabs>
  );
}
