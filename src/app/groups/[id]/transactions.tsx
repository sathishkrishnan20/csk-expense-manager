import { useLocalSearchParams } from "expo-router";
import { GroupHeader } from "../../../ui/GroupHeader";
import { TransactionsView } from "../../../ui/TransactionsView";

export default function GroupTransactions() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <TransactionsView groupId={id} header={<GroupHeader groupId={id} />} />;
}
