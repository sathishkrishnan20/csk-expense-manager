import DateTimePicker from "@react-native-community/datetimepicker";
import { colors } from "./theme";

// The iOS time wheel. The web build uses TimePicker.web.tsx (the browser's own time field).
export function TimePicker({ value, onChange }: { value: Date; onChange: (date: Date) => void }) {
  return (
    <DateTimePicker
      value={value}
      mode="time"
      display="spinner"
      accentColor={colors.primary}
      themeVariant="light"
      onChange={(_event, date) => date && onChange(date)}
    />
  );
}

// Web only (see TimePicker.web.tsx); the phone picks times in a sheet.
export function BrowserTimeInput(_props: { value: string; onChange: (hm: string) => void }) {
  return null;
}
