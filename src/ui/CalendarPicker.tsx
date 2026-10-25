import DateTimePicker from "@react-native-community/datetimepicker";
import { colors } from "./theme";

// The iOS inline calendar. The web build uses CalendarPicker.web.tsx (the browser's own date field).
export function CalendarPicker({ value, onChange }: { value: Date; onChange: (date: Date) => void }) {
  return (
    <DateTimePicker
      value={value}
      mode="date"
      display="inline"
      accentColor={colors.primary}
      themeVariant="light"
      onChange={(_event, date) => date && onChange(date)}
    />
  );
}

// Web only (see CalendarPicker.web.tsx); the phone picks dates in a sheet.
export function BrowserDateInput(_props: { value: string | null; onChange: (iso: string | null) => void }) {
  return null;
}
