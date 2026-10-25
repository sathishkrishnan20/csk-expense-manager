import { useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { helpTopics, type HelpBlock } from "../domain/helpContent";
import { T } from "./Text";
import { colors } from "./theme";

const TOPICS = helpTopics(Platform.OS === "web" ? "web" : "ios");

// The in-app guide, shown in Config > How it works. Text lives in domain/helpContent.ts.
export function HelpSection() {
  const [open, setOpen] = useState<string | null>("overview");

  return (
    <View>
      {TOPICS.map((topic) => {
        const isOpen = open === topic.id;
        return (
          <View key={topic.id} style={styles.topic}>
            <Pressable style={styles.head} onPress={() => setOpen(isOpen ? null : topic.id)} accessibilityRole="button">
              <T weight="medium" style={{ flex: 1, fontSize: 15 }}>
                {topic.title}
              </T>
              <MaterialIcons name={isOpen ? "expand-less" : "expand-more"} size={24} color={colors.textSecondary} />
            </Pressable>
            {isOpen ? (
              <View style={styles.body}>
                {topic.blocks.map((block, i) => (
                  <Block key={i} block={block} />
                ))}
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function Block({ block }: { block: HelpBlock }) {
  if ("text" in block) return <T style={styles.text}>{block.text}</T>;
  const items = "steps" in block ? block.steps : block.bullets;
  return (
    <View style={{ gap: 6 }}>
      {items.map((item, i) => (
        <View key={i} style={styles.item}>
          <T style={styles.marker}>{"steps" in block ? `${i + 1}.` : "•"}</T>
          <T style={[styles.text, { flex: 1 }]}>{item}</T>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  topic: { borderBottomWidth: 1, borderBottomColor: "#eee" },
  head: { flexDirection: "row", alignItems: "center", minHeight: 44, gap: 8 },
  body: { gap: 10, paddingBottom: 14 },
  text: { fontSize: 14, lineHeight: 21, color: colors.text },
  item: { flexDirection: "row", gap: 8 },
  marker: { fontSize: 14, lineHeight: 21, width: 18, color: colors.textSecondary },
});
