import { Tabs } from "expo-router/js-tabs";
import { useLocalSearchParams } from "expo-router";
import { Footer } from "../../../ui/Footer";

// A group has its own bottom tabs, like Main: overview, transactions and charts, with the same + menu.
export default function GroupTabsLayout() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Tabs backBehavior="history" screenOptions={{ headerShown: false }} tabBar={(props) => <Footer {...props} groupId={id} />}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="transactions" />
      <Tabs.Screen name="charts" />
    </Tabs>
  );
}
