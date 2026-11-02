import { colors, fonts } from "./theme";

// The browser's own time field ("HH:MM", 24-hour value). The wheel below is iOS only; the web build never shows the sheet that uses it.
export function BrowserTimeInput({ value, onChange }: { value: string; onChange: (hm: string) => void }) {
  return (
    <input
      type="time"
      value={value}
      onChange={(e) => e.target.value && onChange(e.target.value)}
      style={{
        boxSizing: "border-box",
        width: "100%",
        height: 40,
        padding: "0 8px",
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

export function TimePicker(_props: { value: Date; onChange: (date: Date) => void }) {
  return null;
}
