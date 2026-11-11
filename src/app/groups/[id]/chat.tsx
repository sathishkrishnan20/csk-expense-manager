import { ChatView } from "../../../ui/ChatView";
import { GroupHeader } from "../../../ui/GroupHeader";
import { useRouteGroupId } from "../../../ui/useRouteGroupId";

export default function GroupChat() {
  const id = useRouteGroupId();
  return <ChatView groupId={id} header={<GroupHeader groupId={id} />} />;
}
