import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useSecureLock } from "../platform/useSecureLock";
import { T } from "./Text";
import { Button, TextButton } from "./forms";
import { colors } from "./theme";

// Shows its children once the saved API key is readable. On the web build the key is encrypted
// with a passkey, so until the user unlocks it (Touch ID / device PIN) this shows an Unlock
// button instead. The iPhone Keychain never locks, so there it always shows the children.
export function UnlockGate({ children }: { children: ReactNode }) {
  const { locked, error, unlock, reset } = useSecureLock();
  if (!locked) return <>{children}</>;

  return (
    <View style={styles.box}>
      <T style={styles.note}>
        Your API key is encrypted on this device. Unlock it with your passkey (Touch ID or device PIN) to continue.
      </T>
      <Button label="Unlock with passkey" onPress={unlock} />
      {error ? <T style={styles.error}>{error}</T> : null}
      <TextButton label="Forget saved key" onPress={reset} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 12 },
  note: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  error: { color: colors.error, fontSize: 14 },
});
