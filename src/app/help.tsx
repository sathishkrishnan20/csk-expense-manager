import { ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { AppHeader } from "../ui/Header";
import { HelpSection } from "../ui/HelpSection";
import { colors } from "../ui/theme";

// "How it works": reached from the help icon at the top right of Home.
export default function Help() {
  const router = useRouter();
  return (
    <View style={styles.page}>
      <AppHeader title="How it works" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.body}>
        <HelpSection />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  body: { paddingHorizontal: 16, paddingBottom: 40 },
});
