import { MAIN_GROUP_ID } from "../domain/groups";
import { WithAddButton } from "../ui/AddMenu";
import { AppHeader } from "../ui/Header";
import { TransactionsView } from "../ui/TransactionsView";
import { useTabBack } from "../ui/useGoBack";
import { useHomeGroup } from "../ui/useHomeGroup";

export default function Transactions() {
  const home = useHomeGroup();
  const goBack = useTabBack();
  if (!home) return null;
  return (
    <WithAddButton>
      <TransactionsView groupId={home.id} header={<AppHeader onBack={goBack} title={home.id === MAIN_GROUP_ID ? "Transactions" : `Transactions · ${home.name}`} />} />
    </WithAddButton>
  );
}
