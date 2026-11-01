import { MAIN_GROUP_ID } from "../../domain/groups";
import { ChartsView } from "../../ui/ChartsView";
import { AppHeader } from "../../ui/Header";
import { useHomeGroup } from "../../ui/useHomeGroup";

export default function Charts() {
  const home = useHomeGroup();
  if (!home) return null;
  return <ChartsView groupId={home.id} header={<AppHeader title={home.id === MAIN_GROUP_ID ? "Charts" : `Charts · ${home.name}`} />} />;
}
