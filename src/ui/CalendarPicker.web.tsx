import { colors, fonts } from "./theme";

// The browser's own date field. On web a date is picked right in the field (no OK/Cancel sheet),
// because @react-native-community/datetimepicker has no web build and the browser's calendar
// pops up from the field itself.
export function BrowserDateInput({ value, onChange }: { value: string | null; onChange: (iso: string | null) => void }) {
  return (
    <input
      type="date"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      style={{
        boxSizing: "border-box",
        width: "100%",
        height: "100%",
        padding: "0 13px",
        fontSize: 16,
        fontFamily: fonts.regular,
        color: colors.text,
        background: "transparent",
        border: "none",
        outline: "none",
        accentColor: colors.primary,
      }}
    />
  );
}

// The inline calendar is iOS only; the web build never shows the sheet that uses it.
export function CalendarPicker(_props: { value: Date; onChange: (date: Date) => void }) {
  return null;
}
