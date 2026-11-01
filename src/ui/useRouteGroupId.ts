import { useLocalSearchParams, usePathname } from "expo-router";

// The group a /groups/<id>/... page belongs to. It is read from the address, which always names the group being shown, not
// only from the route's parameter: moving from a group into its subgroup can reuse the same page with the old parameter,
// and then the + menu added entries to the group above instead of the subgroup.
export function groupIdFromPath(pathname: string): string | null {
  const id = /^\/groups\/([^/]+)/.exec(pathname)?.[1];
  return id && id !== "edit" ? decodeURIComponent(id) : null;
}

export function useRouteGroupId(): string {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const fromPath = groupIdFromPath(usePathname());
  return fromPath ?? (typeof id === "string" ? id : "");
}
