import { Platform } from "react-native";

// Values taken from the web Expense Manager (theme.palette.primary, dashboard
// styles.css, and the colours used on its pages).
export const colors = {
  primary: "#7F3DFF",
  primaryLight: "#8B50FF",
  primaryTint: "#EEE5FF",
  gradientFrom: "#9061ed",
  gradientTo: "#5d3ba2",
  income: "#00A86B",
  expense: "#FD3C4A",
  importAction: "#0077FF",
  creditText: "#008000",
  debitText: "#FF0000",
  error: "#d32f2f",
  text: "rgba(0,0,0,0.87)",
  textSecondary: "rgba(0,0,0,0.6)",
  grayText: "#808080",
  outline: "#c4c4c4",
  rowDivider: "#222222",
  surface: "#ffffff",
  background: "#ffffff",
  chart: ["#02B2AF", "#2E96FF", "#B800D8", "#60009B", "#2731C8", "#03008D", "#EEC700"],
};

export const fonts = {
  light: "Roboto_300Light",
  regular: "Roboto_400Regular",
  medium: "Roboto_500Medium",
  bold: "Roboto_700Bold",
  black: "Roboto_900Black",
  serifBold: Platform.select({ web: "Georgia, serif", default: "Georgia-Bold" }),
};

export type FontWeight = Exclude<keyof typeof fonts, "serifBold">;

export const shadow = {
  low: { shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  mid: { shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 4 },
  high: { shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
};
