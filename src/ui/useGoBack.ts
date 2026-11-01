import { useCallback } from "react";
import { useRouter } from "expo-router";
import { useIsDesktop } from "./useLayout";

// What a back arrow does: the page before this one, or Home when there is none (a page opened straight from a link).
export function useGoBack(): () => void {
  const router = useRouter();
  return useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.navigate("/");
  }, [router]);
}

// The back arrow of Transactions, Charts and Config: Home is where the menu is, so on a phone these go back to it. In a wide
// browser window they are top-level pages of the Sidebar and have no back arrow (undefined).
export function useTabBack(): (() => void) | undefined {
  const goBack = useGoBack();
  const desktop = useIsDesktop();
  return desktop ? undefined : goBack;
}
