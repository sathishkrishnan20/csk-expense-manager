import { WithAddButton } from "../../../ui/AddMenu";
import { GroupHeader } from "../../../ui/GroupHeader";
import { TransactionsView } from "../../../ui/TransactionsView";
import { useRouteGroupId } from "../../../ui/useRouteGroupId";

export default function GroupTransactions() {
  const id = useRouteGroupId();
  return (
    <WithAddButton>
      <TransactionsView groupId={id} header={<GroupHeader groupId={id} />} />
    </WithAddButton>
  );
}
