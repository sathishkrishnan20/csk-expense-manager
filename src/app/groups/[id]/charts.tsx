import { WithAddButton } from "../../../ui/AddMenu";
import { ChartsView } from "../../../ui/ChartsView";
import { GroupHeader } from "../../../ui/GroupHeader";
import { useRouteGroupId } from "../../../ui/useRouteGroupId";

export default function GroupCharts() {
  const id = useRouteGroupId();
  return (
    <WithAddButton>
      <ChartsView groupId={id} header={<GroupHeader groupId={id} />} />
    </WithAddButton>
  );
}
