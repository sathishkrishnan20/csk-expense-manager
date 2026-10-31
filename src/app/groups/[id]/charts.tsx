import { useLocalSearchParams } from "expo-router";
import { ChartsView } from "../../../ui/ChartsView";
import { GroupHeader } from "../../../ui/GroupHeader";

export default function GroupCharts() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ChartsView groupId={id} header={<GroupHeader groupId={id} />} />;
}
