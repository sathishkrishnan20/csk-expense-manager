import type { ChatCapability } from "../types";
import { assetsCapability } from "./assets";
import { expensesCapability } from "./expenses";
import { giftsCapability } from "./gifts";
import { groupsCapability } from "./groups";
import { ratesCapability } from "./rates";
import { savingsCapability } from "./savings";
import { trainsCapability } from "./trains";

// Everything Ask AI can look at. A new feature that keeps data adds a capability file here (see domain/chatTools.ts and AGENTS.md); the
// page, the on/off switches, the AI's instructions and the tests pick it up from this list.
export const CAPABILITIES: ChatCapability[] = [expensesCapability, assetsCapability, savingsCapability, giftsCapability, trainsCapability, groupsCapability, ratesCapability];
