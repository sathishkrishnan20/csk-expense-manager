import { useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { MAX_ALARMS, formatHm, hmToDate, normalizeTimes, toHm } from "../domain/trainAlarms";
import { T } from "./Text";
import { BrowserTimeInput, TimePicker } from "./TimePicker";
import { Sheet, TextButton } from "./forms";
import { colors } from "./theme";

// The alarm times of a journey, as a list the owner edits freely: tap a time to change it on the wheel, the red cross removes it, and
// "Add alarm time" adds another. Times are "HH:MM" on the booking day; the list is kept in time order, each time once.
// marks: for a saved journey, whether iOS holds the alarm at each time ("HH:MM" to true or false); a time with no entry shows no mark.
export function AlarmTimesField({ times, onChange, marks }: { times: string[]; onChange: (times: string[]) => void; marks?: Record<string, boolean> }) {
  // index: the time being changed, or null for a new one. draft: what the wheel shows.
  const [editing, setEditing] = useState<{ index: number | null; draft: Date } | null>(null);

  const open = (index: number | null) => {
    // A new time starts a few minutes after the last one, which is usually the next alarm wanted.
    const start = index !== null ? times[index] : times.length > 0 ? toHm(new Date(hmToDate(times[times.length - 1]).getTime() + 5 * 60_000)) : "07:45";
    setEditing({ index, draft: hmToDate(start) });
  };

  const commit = () => {
    if (!editing) return;
    const hm = toHm(editing.draft);
    onChange(normalizeTimes(editing.index === null ? [...times, hm] : times.map((t, i) => (i === editing.index ? hm : t))));
    setEditing(null);
  };

  const webChange = (index: number, hm: string) => onChange(normalizeTimes(times.map((t, i) => (i === index ? hm : t))));

  return (
    <View style={styles.box}>
      <T style={styles.label}>Alarm times (up to {MAX_ALARMS})</T>
      {times.map((hm, i) => (
        <View key={`${hm}-${i}`} style={styles.row}>
          {Platform.OS === "web" ? (
            <View style={styles.time}>
              <BrowserTimeInput value={hm} onChange={(next) => webChange(i, next)} />
            </View>
          ) : (
            <Pressable style={styles.time} onPress={() => open(i)} accessibilityLabel={`Change alarm at ${formatHm(hm)}`}>
              <MaterialIcons name="alarm" size={20} color={colors.primary} />
              <T style={styles.timeText}>{formatHm(hm)}</T>
              {marks && hm in marks ? (
                <MaterialIcons
                  name={marks[hm] ? "check-circle" : "cancel"}
                  size={22}
                  color={marks[hm] ? colors.creditText : colors.error}
                  accessibilityLabel={marks[hm] ? "Alarm is set" : "Alarm is not set"}
                />
              ) : null}
              <MaterialIcons name="edit" size={18} color={colors.textSecondary} />
            </Pressable>
          )}
          <Pressable hitSlop={10} onPress={() => onChange(times.filter((_, j) => j !== i))} accessibilityLabel={`Remove alarm at ${formatHm(hm)}`}>
            <MaterialIcons name="highlight-off" size={24} color={colors.error} />
          </Pressable>
        </View>
      ))}
      {times.length < MAX_ALARMS ? (
        <TextButton
          label="Add alarm time"
          onPress={() => {
            if (Platform.OS === "web") onChange(normalizeTimes([...times, times.length > 0 ? toHm(new Date(hmToDate(times[times.length - 1]).getTime() + 5 * 60_000)) : "07:45"]));
            else open(null);
          }}
        />
      ) : null}

      <Sheet visible={editing !== null} title={editing?.index === null ? "New alarm time" : "Alarm time"} onClose={() => setEditing(null)}>
        {editing ? <TimePicker value={editing.draft} onChange={(draft) => setEditing({ ...editing, draft })} /> : null}
        <View style={styles.sheetActions}>
          <TextButton label="Cancel" onPress={() => setEditing(null)} />
          <TextButton label="OK" onPress={commit} />
        </View>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 8 },
  label: { color: colors.textSecondary, fontSize: 12, paddingHorizontal: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  time: {
    flex: 1,
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: colors.outline,
    borderRadius: 4,
    paddingHorizontal: 12,
    backgroundColor: "#fff",
  },
  timeText: { flex: 1, fontSize: 16 },
  sheetActions: { flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: 8, paddingBottom: 4 },
});
