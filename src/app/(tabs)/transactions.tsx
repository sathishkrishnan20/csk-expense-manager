import { MAIN_GROUP_ID } from "../../domain/groups";
import { AppHeader } from "../../ui/Header";
import { TransactionsView } from "../../ui/TransactionsView";
import { useHomeGroup } from "../../ui/useHomeGroup";

export default function Transactions() {
  const home = useHomeGroup();
  if (!home) return null;
  return <TransactionsView groupId={home.id} header={<AppHeader title={home.id === MAIN_GROUP_ID ? "Transactions" : `Transactions · ${home.name}`} />} />;
}
