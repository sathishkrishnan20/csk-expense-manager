import { MAIN_GROUP_ID } from "../domain/groups";
import { ChatView } from "../ui/ChatView";
import { AppHeader } from "../ui/Header";
import { useTabBack } from "../ui/useGoBack";
import { useHomeGroup } from "../ui/useHomeGroup";

export default function Chat() {
  const home = useHomeGroup();
  const goBack = useTabBack();
  if (!home) return null;
  return <ChatView groupId={home.id} header={<AppHeader onBack={goBack} title={home.id === MAIN_GROUP_ID ? "Ask AI" : `Ask AI · ${home.name}`} />} />;
}
