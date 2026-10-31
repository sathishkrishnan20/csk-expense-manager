import { MAIN_GROUP_ID } from "../../domain/groups";
import { ChartsView } from "../../ui/ChartsView";
import { AppHeader } from "../../ui/Header";

export default function Charts() {
  return <ChartsView groupId={MAIN_GROUP_ID} header={<AppHeader title="Charts" />} />;
}
