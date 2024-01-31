import { CategorySubCategoryGrouped, PaymentMethodsSchema } from "../interface/expenses";



export enum MasterActionKind {
    SET_CATEGORY = 'SET_CATEGORY',
    SET_PAYMENTS = 'SET_PAYMENTS',
    RESET_DATA = 'RESET_DATA',
    
  }
export interface MasterState {
    categoryAndSubCategories?: CategorySubCategoryGrouped[];
    payments?: PaymentMethodsSchema[]
}

export interface MasterAction {
    type: MasterActionKind;
    payload?: MasterState;
}

export const initialMasterDataState = {
    categoryAndSubCategories: []
}

export const masterDataReducer = (state: MasterState, action: MasterAction) => {
    const { type, payload } = action;

    switch (type) {
      case "SET_CATEGORY":
        return {
            ...state,
            categoryAndSubCategories: payload?.categoryAndSubCategories || []
        };
        case MasterActionKind.SET_PAYMENTS:
            return {
                ...state,
                payments: payload?.payments || []
            };
        case MasterActionKind.RESET_DATA: 
            return {
                payments: [],
                categoryAndSubCategories: []
            }
      default:
        return state;
    }
};
