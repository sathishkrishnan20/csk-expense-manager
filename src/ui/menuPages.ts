import type { MaterialIcons } from "@expo/vector-icons";

export type IconName = keyof typeof MaterialIcons.glyphMap;

export interface MenuPage {
  label: string;
  icon: IconName;
  path: string;
}

// The pages of the app, in the order the menu shows them. The phone's drawer (AppDrawer) and the browser's permanent side menu
// (Sidebar) both list these, so a page added here appears in both. Assets and Gifts belong to no group, which is why they live
// in this menu and not on a group's page.
export const MENU_PAGES: MenuPage[] = [
  { label: "Home", icon: "home", path: "/" },
  { label: "Transactions", icon: "dynamic-form", path: "/transactions" },
  { label: "Groups", icon: "folder", path: "/groups" },
  { label: "Charts", icon: "pie-chart", path: "/charts" },
  { label: "Ask AI", icon: "chat", path: "/chat" },
  { label: "Assets", icon: "savings", path: "/assets" },
  { label: "Savings", icon: "account-balance", path: "/savings" },
  { label: "Gifts", icon: "redeem", path: "/gifts" },
  { label: "Gold & Silver Rates", icon: "paid", path: "/rates" },
  { label: "Train alarms", icon: "train", path: "/train" },
  { label: "Config", icon: "settings", path: "/config" },
  { label: "How it works", icon: "help-outline", path: "/help" },
];

// Inside a group the menu is that group's pages, then a way out: its Overview, Transactions, Charts and Ask AI, the Groups list, and Main.
export function groupMenuPages(groupId: string): MenuPage[] {
  return [
    { label: "Overview", icon: "account-balance-wallet", path: `/groups/${groupId}` },
    { label: "Transactions", icon: "dynamic-form", path: `/groups/${groupId}/transactions` },
    { label: "Charts", icon: "pie-chart", path: `/groups/${groupId}/charts` },
    { label: "Ask AI", icon: "chat", path: `/groups/${groupId}/chat` },
    { label: "Groups", icon: "folder", path: "/groups" },
    { label: "Main", icon: "home", path: "/" },
  ];
}
