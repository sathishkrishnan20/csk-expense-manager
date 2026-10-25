import { Tabs } from "expo-router/js-tabs";
import { Footer } from "../../ui/Footer";

export default function TabsLayout() {
  return (
    <Tabs backBehavior="history" screenOptions={{ headerShown: false }} tabBar={(props) => <Footer {...props} />}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="transactions" />
      <Tabs.Screen name="charts" />
      <Tabs.Screen name="config" />
    </Tabs>
  );
}
