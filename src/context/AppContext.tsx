import React, { Dispatch } from "react";
import { MasterAction, MasterState } from "../reducers/category";

interface AppContextProps {
    masterDataState: MasterState, 
    masterDataDispatch?: Dispatch<MasterAction>
}
export const AppContext = React.createContext<AppContextProps>({ masterDataState: { categoryAndSubCategories: [] } });

export function useAppContext() {
  return React.useContext(AppContext);
}