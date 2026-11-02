import { Platform, StyleSheet } from "react-native";
import Constants from "expo-constants";
import * as Updates from "expo-updates";
import { versionLabel } from "../domain/versionLabel";
import { T } from "./Text";
import { colors } from "./theme";

// "Version 1.0.0", and "Version 1.0.0 · update 5f3a9c21" once an over-the-air update is running. Shown at the bottom of the menu.
export function VersionText() {
  const updatesEnabled = Platform.OS !== "web" && Updates.isEnabled;
  return (
    <T style={styles.text}>
      {versionLabel({
        version: Constants.expoConfig?.version ?? null,
        updatesEnabled,
        embedded: updatesEnabled ? Updates.isEmbeddedLaunch : true,
        updateId: updatesEnabled ? Updates.updateId : null,
      })}
    </T>
  );
}

const styles = StyleSheet.create({
  text: { color: colors.textSecondary, fontSize: 12, textAlign: "center", paddingVertical: 8 },
});
