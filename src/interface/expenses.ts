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
}


export interface PaymentMethodsSchema {
    rowId?: string;
    PaymentMethodName?: string;
}

export interface CategorySubCategorySchema {
    rowId?: string;
    CategoryName?: string;
    SubCategoryName?: string;
}

export interface SubCategorySchema {
    rowId: string;
    subCategory: string;
}
export interface CategorySubCategoryGrouped {
    categoryName?: string;
    subCategories: SubCategorySchema[]
}