import { useState } from "react";
import { View } from "react-native";
import { OutlinedInput, SelectField } from "./forms";

const ADD = "+ Add new";

// A dropdown over the owner's own list (the For and Item of an asset) with "+ Add new" at the end, which opens a box to type a name that is
// not in the list yet. The name joins the list when the piece is saved. A value that is not in the list starts in the typing box. With
// `emptyLabel` the list starts with a choice that clears the value (For is optional). The parent holds the value; this decides what to show.
export function OptionField({
  label,
  value,
  options,
  onChange,
  emptyLabel,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
  emptyLabel?: string;
}) {
  const [adding, setAdding] = useState(value.trim() !== "" && !options.some((o) => o.toLowerCase() === value.trim().toLowerCase()));

  const pick = (choice: string) => {
    if (choice === ADD) {
      setAdding(true);
      onChange("");
    } else if (emptyLabel !== undefined && choice === emptyLabel) {
      setAdding(false);
      onChange("");
    } else {
      setAdding(false);
      onChange(choice);
    }
  };

  const shown = adding ? ADD : value === "" ? (emptyLabel ?? "") : value;
  return (
    <View style={{ gap: 10 }}>
      <SelectField label={label} value={shown} options={[...(emptyLabel !== undefined ? [emptyLabel] : []), ...options, ADD]} onChange={pick} />
      {adding ? <OutlinedInput label={`New ${label.toLowerCase()}`} value={value} onChangeText={onChange} autoCapitalize="words" /> : null}
    </View>
  );
}
