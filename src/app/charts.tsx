import { MAIN_GROUP_ID } from "../domain/groups";
import { WithAddButton } from "../ui/AddMenu";
import { ChartsView } from "../ui/ChartsView";
import { AppHeader } from "../ui/Header";
import { useTabBack } from "../ui/useGoBack";
import { useHomeGroup } from "../ui/useHomeGroup";

export default function Charts() {
  const home = useHomeGroup();
  const goBack = useTabBack();
  if (!home) return null;
  return (
    <WithAddButton>
      <ChartsView groupId={home.id} header={<AppHeader onBack={goBack} title={home.id === MAIN_GROUP_ID ? "Charts" : `Charts · ${home.name}`} />} />
    </WithAddButton>
  );
}
