import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { resolveHomeGroup, type HomeGroup } from "../db/homeGroup";

// The group the Home, Transactions and Charts tabs show. Null for the moment it takes to read the setting, so a page never flashes
// Main first. Read again every time the tab is focused, so a change made on the Groups page shows straight away.
export function useHomeGroup(): HomeGroup | null {
  const [home, setHome] = useState<HomeGroup | null>(null);
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      resolveHomeGroup().then((h) => {
        if (alive) setHome((current) => (current && current.id === h.id && current.name === h.name ? current : h));
      });
      return () => {
        alive = false;
      };
    }, []),
  );
  return home;
}
