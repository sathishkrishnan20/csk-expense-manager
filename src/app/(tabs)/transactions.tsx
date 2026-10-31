import { MAIN_GROUP_ID } from "../../domain/groups";
import { AppHeader } from "../../ui/Header";
import { TransactionsView } from "../../ui/TransactionsView";

export default function Transactions() {
  return <TransactionsView groupId={MAIN_GROUP_ID} header={<AppHeader title="Transactions" />} />;
}
