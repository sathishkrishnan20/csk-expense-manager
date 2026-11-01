import { GroupHeader } from "../../../ui/GroupHeader";
import { TransactionsView } from "../../../ui/TransactionsView";
import { useRouteGroupId } from "../../../ui/useRouteGroupId";

export default function GroupTransactions() {
  const id = useRouteGroupId();
  return <TransactionsView groupId={id} header={<GroupHeader groupId={id} />} />;
}
