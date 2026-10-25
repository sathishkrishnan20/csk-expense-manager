import { Text, type TextProps } from "react-native";
import { colors, fonts, type FontWeight } from "./theme";

// Roboto, like the web app. React Native needs one font family per weight.
export function T({ weight = "regular", style, ...rest }: TextProps & { weight?: FontWeight }) {
  return <Text {...rest} style={[{ fontFamily: fonts[weight], fontSize: 16, color: colors.text }, style]} />;
}
