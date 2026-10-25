import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Animated,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { MaterialIcons } from "@expo/vector-icons";
import { formatFieldDate, fromISODate, toISODate } from "../domain/format";
import { T } from "./Text";
import { colors, fonts, shadow } from "./theme";

const FIELD_HEIGHT = 56;

// MUI "outlined" field: 1px border, label sits on the border once the field is focused or filled.
function FieldFrame({
  label,
  floated,
  focused,
  disabled,
  children,
  style,
}: {
  label: string;
  floated: boolean;
  focused?: boolean;
  disabled?: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const accent = focused ? colors.primary : colors.textSecondary;
  return (
    <View
      style={[
        styles.frame,
        { borderColor: focused ? colors.primary : colors.outline, borderWidth: focused ? 2 : 1, opacity: disabled ? 0.5 : 1 },
        style,
      ]}
    >
      {children}
      <View pointerEvents="none" style={[styles.labelWrap, floated ? styles.labelFloated : styles.labelResting]}>
        <T style={{ fontSize: floated ? 12 : 16, color: accent, backgroundColor: floated ? "#fff" : "transparent" }}>
          {floated ? ` ${label} ` : label}
        </T>
      </View>
    </View>
  );
}

export function OutlinedInput({
  label,
  value,
  onChangeText,
  keyboardType,
  secureTextEntry,
  autoCapitalize = "sentences",
  editable = true,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  keyboardType?: KeyboardTypeOptions;
  secureTextEntry?: boolean;
  autoCapitalize?: "none" | "sentences" | "words";
  editable?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <FieldFrame label={label} floated={focused || value !== ""} focused={focused} disabled={!editable}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        keyboardType={keyboardType}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        editable={editable}
        style={styles.input}
        selectionColor={colors.primary}
      />
    </FieldFrame>
  );
}

// A bottom sheet list, standing in for the MUI Select menu.
export function Sheet({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: ReactNode }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <T weight="medium" style={styles.sheetTitle}>
            {title}
          </T>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function SelectField({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable disabled={disabled} onPress={() => setOpen(true)}>
        <FieldFrame label={label} floated={value !== ""} disabled={disabled}>
          <T style={styles.selectValue} numberOfLines={1}>
            {value}
          </T>
          <MaterialIcons name="arrow-drop-down" size={24} color={colors.textSecondary} style={styles.dropIcon} />
        </FieldFrame>
      </Pressable>
      <Sheet visible={open} title={label} onClose={() => setOpen(false)}>
        {options.length === 0 ? (
          <T style={styles.empty}>Nothing to choose from yet.</T>
        ) : (
          <FlatList
            data={options}
            keyExtractor={(item, i) => `${item}-${i}`}
            style={{ maxHeight: 380 }}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  onChange(item);
                  setOpen(false);
                }}
                style={[styles.option, item === value && styles.optionSelected]}
              >
                <T weight={item === value ? "medium" : "regular"}>{item}</T>
              </Pressable>
            )}
          />
        )}
      </Sheet>
    </>
  );
}

// The small "standard" Select used next to a chart title.
export function InlineSelect<V extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: V;
  options: { value: V; label: string }[];
  onChange: (value: V) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value)?.label ?? "";
  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={styles.inline}>
        <T>{current}</T>
        <MaterialIcons name="arrow-drop-down" size={24} color={colors.textSecondary} />
      </Pressable>
      <Sheet visible={open} title={label} onClose={() => setOpen(false)}>
        {options.map((o) => (
          <Pressable
            key={o.value}
            onPress={() => {
              onChange(o.value);
              setOpen(false);
            }}
            style={[styles.option, o.value === value && styles.optionSelected]}
          >
            <T weight={o.value === value ? "medium" : "regular"}>{o.label}</T>
          </Pressable>
        ))}
      </Sheet>
    </>
  );
}

export function DateField({ label, value, onChange }: { label: string; value: string; onChange: (iso: string) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(fromISODate(value));
  return (
    <>
      <Pressable
        onPress={() => {
          setDraft(fromISODate(value));
          setOpen(true);
        }}
      >
        <FieldFrame label={label} floated>
          <T style={styles.selectValue}>{formatFieldDate(value)}</T>
          <MaterialIcons name="calendar-today" size={20} color={colors.textSecondary} style={styles.dropIcon} />
        </FieldFrame>
      </Pressable>
      <Sheet visible={open} title={label} onClose={() => setOpen(false)}>
        <DateTimePicker
          value={draft}
          mode="date"
          display="inline"
          accentColor={colors.primary}
          themeVariant="light"
          onChange={(_event, date) => date && setDraft(date)}
        />
        <View style={styles.sheetActions}>
          <TextButton label="Cancel" onPress={() => setOpen(false)} />
          <TextButton
            label="OK"
            onPress={() => {
              onChange(toISODate(draft));
              setOpen(false);
            }}
          />
        </View>
      </Sheet>
    </>
  );
}

export function RadioOption({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.radio} hitSlop={6}>
      <MaterialIcons
        name={selected ? "radio-button-checked" : "radio-button-unchecked"}
        size={24}
        color={selected ? colors.primary : colors.textSecondary}
      />
      <T style={{ marginLeft: 6 }}>{label}</T>
    </Pressable>
  );
}

export function Button({
  label,
  onPress,
  disabled,
  color = colors.primary,
  style,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: disabled ? "rgba(0,0,0,0.12)" : color, opacity: pressed ? 0.85 : 1 },
        !disabled && shadow.low,
        style,
      ]}
    >
      <T weight="medium" style={[styles.buttonLabel, disabled && { color: "rgba(0,0,0,0.26)" }]}>
        {label.toUpperCase()}
      </T>
    </Pressable>
  );
}

export function TextButton({ label, onPress, color = colors.primary }: { label: string; onPress: () => void; color?: string }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} style={styles.textButton}>
      <T weight="medium" style={{ color, fontSize: 14, letterSpacing: 1.25 }}>
        {label.toUpperCase()}
      </T>
    </Pressable>
  );
}

export function Chip({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.chip}>
      <T style={{ color: colors.primary, fontSize: 13 }}>{label}</T>
    </Pressable>
  );
}

// A transient message near the bottom, like MUI's Snackbar.
export function useSnackbar() {
  const [message, setMessage] = useState<string | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(
    (text: string, ms = 2000) => {
      if (timer.current) clearTimeout(timer.current);
      setMessage(text);
      Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
      timer.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setMessage(null));
      }, ms);
    },
    [opacity],
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const node = message ? (
    <Animated.View pointerEvents="none" style={[styles.snackbar, { opacity }]}>
      <T style={styles.snackbarText}>{message}</T>
    </Animated.View>
  ) : null;

  return { show, node };
}

const styles = StyleSheet.create({
  frame: { height: FIELD_HEIGHT, borderRadius: 4, justifyContent: "center", backgroundColor: "#fff" },
  labelWrap: { position: "absolute" },
  labelResting: { left: 14, top: 15 },
  labelFloated: { left: 10, top: -10 },
  input: { fontFamily: fonts.regular, fontSize: 16, paddingHorizontal: 13, height: FIELD_HEIGHT - 4, color: colors.text },
  selectValue: { paddingHorizontal: 13, paddingRight: 40 },
  dropIcon: { position: "absolute", right: 10 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: 24 },
  sheet: { backgroundColor: "#fff", borderRadius: 8, paddingVertical: 8, ...shadow.high },
  sheetTitle: { paddingHorizontal: 16, paddingVertical: 12, fontSize: 18 },
  sheetActions: { flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: 8, paddingBottom: 4 },
  option: { paddingHorizontal: 16, paddingVertical: 14 },
  optionSelected: { backgroundColor: "rgba(127,61,255,0.1)" },
  empty: { paddingHorizontal: 16, paddingVertical: 12, color: colors.textSecondary },
  inline: { flexDirection: "row", alignItems: "center", minWidth: 120, justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: colors.outline, paddingVertical: 4 },
  radio: { flexDirection: "row", alignItems: "center", marginRight: 24 },
  button: { height: 36, minWidth: 64, borderRadius: 4, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" },
  buttonLabel: { color: "#fff", fontSize: 14, letterSpacing: 1.25 },
  textButton: { paddingHorizontal: 12, paddingVertical: 8 },
  chip: { height: 32, borderRadius: 16, paddingHorizontal: 12, justifyContent: "center", backgroundColor: colors.primaryTint },
  snackbar: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 110,
    alignItems: "center",
  },
  snackbarText: {
    backgroundColor: "#323232",
    color: "#fff",
    fontSize: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 4,
    overflow: "hidden",
    textAlign: "center",
  },
});
