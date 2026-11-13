import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { askChat } from "../chat/ask";
import { CAPABILITIES } from "../chat/capabilities";
import { addApprovedSubcategory } from "../db/config";
import { loadChatThread, saveChatThread } from "../db/chatHistory";
import { fromRows, newThreadId, threadTitle, toRows } from "../domain/chatHistory";
import type { PreparedAction } from "../domain/chatTools";
import { listGroupsWithBalances } from "../db/groups";
import {
  CHAT_PERIODS,
  DEFAULT_CHAT_PERIOD,
  EXAMPLE_QUESTIONS,
  MAX_QUESTION_CHARS,
  type ChatMessage,
  type ChatPeriod,
  type ChatProposal,
  privacyNote,
} from "../domain/expenseChat";
import type { GroupWithBalance } from "../domain/groups";
import { scopeKey, type GroupScope } from "../domain/groupScope";
import { PROVIDER_LABEL, type Provider } from "../llm/providers";
import { loadProvider } from "../settings/settings";
import { T } from "./Text";
import { Button, Chip, InlineSelect, TextButton } from "./forms";
import { GroupFilter } from "./GroupFilter";
import { colors } from "./theme";

// Behaviour of the keyboard-avoiding view, named for every platform: the iPhone pushes the page up with padding, Android resizes it, and
// a browser has no on-screen keyboard to avoid.
const KEYBOARD_BEHAVIOR = Platform.select<"padding" | "height" | undefined>({ ios: "padding", android: "height", web: undefined, default: undefined });

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

type ProposalState = "adding" | "added" | "dismissed";
type ActionState = { status: "saving" | "saved" | "cancelled"; error?: string };

// Questions about your own spending, answered by the AI chosen in Config, for the groups and period chosen here. The chat is saved in the history
// as it goes (History, next to New chat). When the AI thinks nothing in your list fits what you bought, it can propose a new subcategory; it is added only when you tap
// the button under its answer.
export function ChatView({ groupId, header }: { groupId: string; header: ReactNode }) {
  const [allGroups, setAllGroups] = useState<GroupWithBalance[]>([]);
  const [scope, setScope] = useState<GroupScope>([groupId]);
  useEffect(() => setScope([groupId]), [groupId]); // another page group starts on that group again
  const [period, setPeriod] = useState<ChatPeriod>(DEFAULT_CHAT_PERIOD);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposals, setProposals] = useState<Record<number, ProposalState>>({});
  const [proposalError, setProposalError] = useState<Record<number, string>>({});
  const [actions, setActions] = useState<Record<number, ActionState>>({});
  const router = useRouter();

  // The chat is kept in the history as it goes (db/chatHistory.ts). threadId is its id once the first message is sent; savedJson is what was last
  // written, so opening an old chat and only reading it writes nothing and does not make it look recent.
  const threadId = useRef<string | null>(null);
  const savedJson = useRef<string | null>(null);
  const { thread, at } = useLocalSearchParams<{ thread?: string; at?: string }>();
  const [provider, setProvider] = useState<Provider>("gemini");
  const kinds = CAPABILITIES.map((c) => c.title); // everything the AI can look at
  const scroll = useRef<{ scrollToEnd: (options?: { animated?: boolean }) => void }>(null); // only what is used of the ScrollView
  const key = scopeKey(scope);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      listGroupsWithBalances().then((gs) => alive && setAllGroups(gs));
      // The AI chosen in Config and the privacy switch can change on another page, so they are read each time this one is shown.
      loadProvider().then((p) => alive && setProvider(p));
      return () => {
        alive = false;
      };
    }, []),
  );

  const ask = async (history: ChatMessage[]) => {
    setBusy(true);
    setError(null);
    try {
      const reply = await askChat(scope, period, history);
      setMessages([
        ...history,
        { role: "assistant", text: reply.answer, proposal: reply.proposal ?? undefined, toolsUsed: reply.toolsUsed?.length ? reply.toolsUsed : undefined, action: reply.action },
      ]);
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  const send = (text: string) => {
    const question = text.trim().slice(0, MAX_QUESTION_CHARS);
    if (!question || busy) return;
    const history: ChatMessage[] = [...messages, { role: "user", text: question }];
    setMessages(history);
    setInput("");
    ask(history);
  };

  const addToList = async (index: number, proposal: ChatProposal) => {
    setProposals((all) => ({ ...all, [index]: "adding" }));
    setProposalError((all) => ({ ...all, [index]: "" }));
    try {
      await addApprovedSubcategory(proposal.category, proposal.subcategory, proposal.description);
      setProposals((all) => ({ ...all, [index]: "added" }));
    } catch (err) {
      setProposals((all) => {
        const { [index]: _gone, ...rest } = all;
        return rest;
      });
      setProposalError((all) => ({ ...all, [index]: message(err) }));
    }
  };

  // The owner's tap on Save is the only thing that writes. What was done is added to the chat, so the AI knows it is done and does not add it twice.
  const saveAction = async (index: number, action: PreparedAction) => {
    if (actions[index]?.status === "saving" || actions[index]?.status === "saved") return;
    setActions((all) => ({ ...all, [index]: { status: "saving" } }));
    try {
      const done = await action.save();
      setActions((all) => ({ ...all, [index]: { status: "saved" } }));
      setMessages((current) => [...current, { role: "assistant", text: `Saved. ${done}` }]);
    } catch (err) {
      setActions((all) => {
        const { [index]: _gone, ...rest } = all;
        return rest;
      });
      setActionErrors((all) => ({ ...all, [index]: message(err) }));
    }
  };

  const cancelAction = (index: number) => {
    setActions((all) => ({ ...all, [index]: { status: "cancelled" } }));
    setMessages((current) => [...current, { role: "assistant", text: "You rejected it. Nothing was saved." }]);
  };

  // Opening a chat from the history: its messages come back, and the AI carries on from them when the owner writes again.
  const threadKey = typeof thread === "string" && thread !== "" ? `${thread}|${at ?? ""}` : null;
  useEffect(() => {
    if (threadKey === null || typeof thread !== "string") return;
    let alive = true;
    loadChatThread(thread)
      .then((found) => {
        if (!alive) return;
        if (!found) {
          setError("That chat is no longer saved. Chats are kept for 30 days after their last message.");
          return;
        }
        const restored = fromRows(found.rows);
        threadId.current = thread;
        savedJson.current = JSON.stringify(found.rows);
        setMessages(restored.messages);
        setProposals(restored.proposals);
        setActions({});
        setActionErrors({});
        setProposalError({});
        setError(null);
        setScope([groupId]);
      })
      .catch((err) => alive && setError(message(err)));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadKey]);

  // Every change to the chat is written to the history. It is only a convenience, so a failure to write is not shown.
  useEffect(() => {
    if (messages.length === 0) return;
    const rows = toRows(
      messages,
      (i) => (actions[i]?.status === "saved" ? "saved" : actions[i]?.status === "cancelled" ? "cancelled" : "not_saved"),
      (i) => (proposals[i] === "added" || proposals[i] === "dismissed" ? proposals[i] : undefined),
    );
    const json = JSON.stringify(rows);
    if (json === savedJson.current) return;
    savedJson.current = json;
    threadId.current ??= newThreadId();
    saveChatThread(threadId.current, threadTitle(messages), groupId, rows).catch(() => undefined);
  }, [messages, actions, proposals, groupId]);

  const clear = () => {
    threadId.current = null;
    savedJson.current = null;
    setActions({});
    setActionErrors({});
    setMessages([]);
    setProposals({});
    setProposalError({});
    setError(null);
  };

  const [actionErrors, setActionErrors] = useState<Record<number, string>>({});
  const canSend = input.trim() !== "" && !busy;

  return (
    <KeyboardAvoidingView style={styles.page} behavior={KEYBOARD_BEHAVIOR}>
      {header}
      <GroupFilter groups={allGroups} scope={scope} onChange={setScope} />
      <View style={styles.periodRow}>
        <T style={styles.periodLabel}>Period</T>
        <InlineSelect label="Period" value={period} options={CHAT_PERIODS} onChange={setPeriod} />
        <View style={styles.periodActions}>
          <TextButton label="History" onPress={() => router.push("/chat-history")} />
          {messages.length > 0 ? <TextButton label="New chat" onPress={clear} /> : null}
        </View>
      </View>

      <ScrollView
        ref={(node) => {
          scroll.current = node;
        }}
        style={{ flex: 1 }}
        contentContainerStyle={styles.messages}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
      >
        {messages.length === 0 ? (
          <View>
            <T weight="medium" style={styles.hello}>
              Ask, or tell me what to add
            </T>
            <T style={styles.note}>
              For example: what a purchase should be filed under, where your money goes, or what you could cut down. You can also say what to add, such as an
              expense: I will ask for what is missing and show it first, and nothing is saved until you tap Save. Answers use the group and period chosen above. {privacyNote(PROVIDER_LABEL[provider], provider === "ollama", kinds)}
            </T>
            <View style={styles.examples}>
              {EXAMPLE_QUESTIONS.map((q) => (
                <Chip key={q} label={q} onPress={() => setInput(q)} />
              ))}
            </View>
          </View>
        ) : null}

        {messages.map((m, i) => (
          <View key={i} style={[styles.row, m.role === "user" ? styles.rowUser : styles.rowAssistant]}>
            <View style={[styles.bubble, m.role === "user" ? styles.bubbleUser : styles.bubbleAssistant]}>
              <T selectable style={styles.bubbleText}>
                {m.text}
              </T>
            </View>
            {m.toolsUsed?.length ? <T style={styles.looked}>Looked at: {m.toolsUsed.join(", ")}</T> : null}
            {m.pastCard ? <ActionCard action={m.pastCard} state={m.pastCard.outcome === "saved" ? "saved" : m.pastCard.outcome === "cancelled" ? "cancelled" : undefined} active={false} error={undefined} onSave={() => undefined} onCancel={() => undefined} /> : null}
            {m.action ? (
              <ActionCard
                action={m.action}
                state={actions[i]?.status}
                active={i === messages.length - 1}
                error={actionErrors[i]}
                onSave={() => saveAction(i, m.action!)}
                onCancel={() => cancelAction(i)}
              />
            ) : null}
            {m.proposal ? (
              <ProposalCard
                proposal={m.proposal}
                state={proposals[i]}
                error={proposalError[i]}
                onAdd={() => addToList(i, m.proposal!)}
                onDismiss={() => setProposals((all) => ({ ...all, [i]: "dismissed" }))}
              />
            ) : null}
          </View>
        ))}

        {busy ? <T style={styles.thinking}>Thinking…</T> : null}
        {error ? (
          <View style={styles.errorBox}>
            <T style={styles.errorText}>{error}</T>
            {messages.length > 0 && messages[messages.length - 1].role === "user" ? <TextButton label="Try again" onPress={() => ask(messages)} /> : null}
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Ask, or say what to add"
          placeholderTextColor={colors.grayText}
          multiline
          maxLength={MAX_QUESTION_CHARS}
          editable={!busy}
        />
        <Pressable
          onPress={() => send(input)}
          disabled={!canSend}
          style={[styles.send, !canSend && styles.sendOff]}
          accessibilityRole="button"
          accessibilityLabel="Send"
        >
          <MaterialIcons name="send" size={22} color="#fff" />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

// Something the AI prepared to add. It shows exactly what would be saved; only Save writes it. Once the chat moves on (a new message, such as a
// change the owner asks for) the card is no longer active, because the AI answers with a new one.
function ActionCard({
  action,
  state,
  active,
  error,
  onSave,
  onCancel,
}: {
  action: Pick<PreparedAction, "title" | "lines">;
  state: ActionState["status"] | undefined;
  active: boolean;
  error: string | undefined;
  onSave: () => void;
  onCancel: () => void;
}) {
  const finished = state === "saved" || state === "cancelled";
  return (
    <View style={[styles.proposal, styles.actionCard, finished && { opacity: 0.6 }]}>
      <T style={styles.proposalKind}>{action.title}</T>
      {action.lines.map((line) => (
        <View key={line.label} style={styles.cardLine}>
          <T style={styles.cardLabel}>{line.label}</T>
          <T weight="medium" style={styles.cardValue}>
            {line.value}
          </T>
        </View>
      ))}
      {error ? <T style={styles.errorText}>{error}</T> : null}
      {state === "saved" ? (
        <T style={styles.added}>Accepted and saved.</T>
      ) : state === "cancelled" ? (
        <T style={styles.note}>Rejected. Nothing was saved.</T>
      ) : active ? (
        <>
          <View style={styles.proposalActions}>
            <Button label={state === "saving" ? "Saving…" : "Save"} onPress={onSave} disabled={state === "saving"} />
            <TextButton label="Cancel" onPress={onCancel} />
          </View>
          <T style={styles.cardHint}>To change something, just tell me.</T>
        </>
      ) : (
        <T style={styles.note}>No decision was made, so nothing was saved. This card was replaced or the chat moved on.</T>
      )}
    </View>
  );
}

// The AI's proposal for a category and subcategory that are not in the list. Adding is the owner's choice.
function ProposalCard({
  proposal,
  state,
  error,
  onAdd,
  onDismiss,
}: {
  proposal: ChatProposal;
  state: ProposalState | undefined;
  error: string | undefined;
  onAdd: () => void;
  onDismiss: () => void;
}) {
  if (state === "dismissed") return null;
  return (
    <View style={styles.proposal}>
      <T style={styles.proposalKind}>{proposal.status === "new-category" ? "Suggested new category" : `Suggested new subcategory under ${proposal.category}`}</T>
      <T weight="medium" style={styles.proposalName}>
        {proposal.category} : {proposal.subcategory}
      </T>
      {proposal.description ? <T style={styles.proposalDescription}>{proposal.description}</T> : null}
      {error ? <T style={styles.errorText}>{error}</T> : null}
      {state === "added" ? (
        <T style={styles.added}>Added to your categories. Nothing was moved.</T>
      ) : (
        <View style={styles.proposalActions}>
          <Button label={state === "adding" ? "Adding…" : "Add to my list"} onPress={onAdd} disabled={state === "adding"} />
          <TextButton label="Not now" onPress={onDismiss} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  periodRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 4 },
  periodLabel: { color: colors.textSecondary },
  periodActions: { marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 12 },
  looked: { color: colors.textSecondary, fontSize: 11, marginLeft: 4 },
  messages: { padding: 12, gap: 10, flexGrow: 1 },
  hello: { fontSize: 18, marginTop: 8 },
  note: { color: colors.textSecondary, fontSize: 13, marginTop: 6, lineHeight: 19 },
  examples: { marginTop: 14, gap: 8, alignItems: "flex-start" },
  row: { gap: 6 },
  rowUser: { alignItems: "flex-end" },
  rowAssistant: { alignItems: "flex-start" },
  bubble: { maxWidth: "92%", borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 },
  bubbleUser: { backgroundColor: colors.primaryTint },
  bubbleAssistant: { backgroundColor: "#f3f3f3" },
  bubbleText: { fontSize: 15, lineHeight: 21 },
  thinking: { color: colors.textSecondary, fontStyle: "italic" },
  errorBox: { gap: 4, alignItems: "flex-start" },
  errorText: { color: colors.error, fontSize: 13 },
  proposal: { maxWidth: "92%", borderWidth: 1, borderColor: colors.primary, borderRadius: 12, padding: 12, gap: 4, backgroundColor: "#fff" },
  proposalKind: { color: colors.primary, fontSize: 12 },
  proposalName: { fontSize: 15 },
  proposalDescription: { color: colors.textSecondary, fontSize: 13 },
  // The card takes the width of a message, so a long value (a shop name, the date, the group) wraps instead of being cut off.
  actionCard: { width: "92%" },
  cardLine: { flexDirection: "row", gap: 8 },
  cardLabel: { width: 96, color: colors.textSecondary, fontSize: 13 },
  cardValue: { flex: 1, flexShrink: 1, fontSize: 14 },
  cardHint: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  proposalActions: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 6 },
  added: { color: colors.creditText, fontSize: 13, marginTop: 4 },
  inputBar: { flexDirection: "row", alignItems: "flex-end", gap: 8, padding: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.outline, backgroundColor: "#fff" },
  input: { flex: 1, minHeight: 44, maxHeight: 120, borderWidth: 1, borderColor: colors.outline, borderRadius: 22, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, fontSize: 15, color: colors.text },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  sendOff: { opacity: 0.4 },
});
