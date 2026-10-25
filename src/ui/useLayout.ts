import { Platform, useWindowDimensions } from "react-native";

// Same breakpoint as the web Expense Manager (Tailwind "md"): from here up the bottom bar
// gives way to a permanent side drawer. Only the web build can get this wide; phones never do.
export const DESKTOP_MIN_WIDTH = 768;
export const SIDEBAR_WIDTH = 240;
export const PHONE_COLUMN_MAX_WIDTH = 480;

export function useIsDesktop(): boolean {
  const { width } = useWindowDimensions();
  return Platform.OS === "web" && width >= DESKTOP_MIN_WIDTH;
}

// The width the page content actually gets, for things that must be sized in pixels (charts).
export function useContentWidth(): number {
  const { width } = useWindowDimensions();
  if (Platform.OS !== "web") return width;
  return width >= DESKTOP_MIN_WIDTH ? width - SIDEBAR_WIDTH : Math.min(width, PHONE_COLUMN_MAX_WIDTH);
}
