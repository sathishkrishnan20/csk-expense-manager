export interface ExpenseSchema {
  RowId?: string;
  Category: string;
  SubCategory: string;
  Amount: string;
  Payee: string;
  PaymentMethod: string;
  Description: string;
  OpeningBalance?: string;
  ClosingBalance?: string;
  Status: string;
  Timestamp: string;
  TransactionDate: string;
}
export type StatusType = 'ACTIVE' | 'DELETED';
export interface PaymentMethodsSchema {
  RowId?: string;
  PaymentMethodName?: string;
  Timestamp?: string;
  Status?: StatusType;
}

export interface CategorySubCategorySchema {
  RowId?: string;
  CategoryName?: string;
  SubCategoryName?: string;
  Timestamp?: string;
  Status: StatusType;
}

export interface SubCategorySchema {
  RowId: string;
  subCategory: string;
  Status: StatusType;
}
export interface CategorySubCategoryGrouped {
  categoryName?: string;
  subCategories: SubCategorySchema[];
}

export interface CategorySubCategoryGroupedWithInternalState {
  categoryName?: string;
  isEdited?: boolean;
  subCategories: (SubCategorySchema & { isEdited?: boolean })[];
}
