import { Alert, Platform } from "react-native";

// Alert.alert does nothing on web, so confirmations and notices go through the
// browser's own dialogs there.
export function notify(message: string): void {
  if (Platform.OS === "web") window.alert(message);
  else Alert.alert(message);
}

export function confirmAction(opts: { title: string; message?: string; confirmLabel: string }): Promise<boolean> {
  if (Platform.OS === "web") {
    return Promise.resolve(window.confirm(opts.message ? `${opts.title}\n\n${opts.message}` : opts.title));
  }
  return new Promise((resolve) => {
    Alert.alert(
      opts.title,
      opts.message,
      [
        { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
        { text: opts.confirmLabel, style: "destructive", onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
