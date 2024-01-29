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

export interface PaymentMethodsSchema {
  RowId?: string;
  PaymentMethodName?: string;
  Timestamp?: string;
}

export interface CategorySubCategorySchema {
  RowId?: string;
  CategoryName?: string;
  SubCategoryName?: string;
  Timestamp?: string;
}

export interface SubCategorySchema {
  RowId: string;
  subCategory: string;
}
export interface CategorySubCategoryGrouped {
  categoryName?: string;
  subCategories: SubCategorySchema[];
}
