import { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { deleteAllChatThreads, deleteChatThread, listChatThreads, type ThreadSummary } from "../db/chatHistory";
import { listGroupsWithBalances } from "../db/groups";
import { CHAT_HISTORY_DAYS, sqliteUtcToMs } from "../domain/chatHistory";
import { formatRelativeTime } from "../domain/format";
import { confirmAction, notify } from "../platform/dialogs";
import { AppHeader, HeaderTextButton } from "../ui/Header";
import { RowDivider } from "../ui/TransactionRow";
import { T } from "../ui/Text";
import { useGoBack } from "../ui/useGoBack";
import { useHomeGroup } from "../ui/useHomeGroup";
import { colors } from "../ui/theme";

// The Ask AI chats kept on this phone, newest first. Tapping one opens it with its messages, and the owner can carry on from where it ended. Chats are
// removed 30 days after their last message, each time the app opens (db/chatHistory.ts, cleanUpOldChats).
export default function ChatHistory() {
  const router = useRouter();
  const goBack = useGoBack();
  const home = useHomeGroup();
  const [threads, setThreads] = useState<ThreadSummary[] | null>(null);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const [list, groups] = await Promise.all([listChatThreads(), listGroupsWithBalances()]);
    setThreads(list);
    setOpenGroups(new Set(groups.filter((g) => g.status === "ACTIVE").map((g) => g.id)));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load().catch((err) => notify(`The history could not be read: ${err instanceof Error ? err.message : String(err)}`));
    }, [load]),
  );

  // A chat opens on the page it was had on (Home's chat, or a group's own chat); a group that is gone or closed opens on Home's chat.
  const open = (t: ThreadSummary) => {
    const params = { thread: t.id, at: String(Date.now()) };
    if (t.groupId && home && t.groupId !== home.id && openGroups.has(t.groupId)) router.navigate({ pathname: "/groups/[id]/chat", params: { id: t.groupId, ...params } });
    else router.navigate({ pathname: "/chat", params });
  };

  const remove = async (t: ThreadSummary) => {
    if (!(await confirmAction({ title: "Delete this chat?", message: t.title, confirmLabel: "Delete" }))) return;
    await deleteChatThread(t.id);
    await load();
  };

  const removeAll = async () => {
    if (!(await confirmAction({ title: "Delete every saved chat?", message: "This cannot be undone.", confirmLabel: "Delete all" }))) return;
    await deleteAllChatThreads();
    await load();
  };

  const now = Date.now();
  return (
    <View style={styles.page}>
      <AppHeader title="Chat history" onBack={goBack} right={threads && threads.length > 0 ? <HeaderTextButton label="Delete all" onPress={removeAll} /> : undefined} />
      <FlatList
        data={threads ?? []}
        keyExtractor={(t) => t.id}
        ListHeaderComponent={
          <T style={styles.note}>Your Ask AI chats are kept on this phone for {CHAT_HISTORY_DAYS} days after their last message, then removed each time the app opens. Tap one to read it or carry on.</T>
        }
        renderItem={({ item }) => (
          <View>
            <View style={styles.row}>
              <Pressable style={styles.body} onPress={() => open(item)} accessibilityRole="button" accessibilityLabel={`Open chat: ${item.title}`}>
                <T weight="medium" numberOfLines={2}>
                  {item.title}
                </T>
                <T weight="light" style={styles.small}>
                  {item.messages} {item.messages === 1 ? "message" : "messages"} · {formatRelativeTime(sqliteUtcToMs(item.updatedAt), now)}
                </T>
              </Pressable>
              <Pressable hitSlop={10} onPress={() => remove(item)} accessibilityRole="button" accessibilityLabel="Delete chat" style={styles.delete}>
                <MaterialIcons name="delete-outline" size={24} color={colors.textSecondary} />
              </Pressable>
            </View>
            <RowDivider />
          </View>
        )}
        ListEmptyComponent={threads === null ? undefined : <T style={styles.empty}>No saved chats yet. Chats you have in Ask AI will be listed here.</T>}
        contentContainerStyle={{ paddingBottom: 32 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  note: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, padding: 12 },
  row: { backgroundColor: "#fff", flexDirection: "row", alignItems: "center" },
  body: { flex: 1, padding: 12, gap: 2 },
  small: { fontSize: 13, color: colors.grayText },
  delete: { padding: 12 },
  empty: { textAlign: "center", color: colors.textSecondary, marginTop: 32, marginHorizontal: 32 },
});
