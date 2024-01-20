import axios from "axios";
import { LOCAL_SESSION_KEYS, getItem } from "../context/storage";
import { CategorySubCategoryGrouped, CategorySubCategorySchema, ExpenseSchema, PaymentMethodsSchema } from "../interface/expenses";

const CATEGORY_SUBCATEGORY_SHEET_NAME = 'categoryAndSubCategory';
const PAYMENT_METHOD_SHEET_NAME = 'paymentMethods'
const TRANSACTION_SHEET_NAME = 'Sheet1'
const TRANSACTION_COLUMNS_ORDERS: (keyof ExpenseSchema)[] = ['RowId', 'Category', 'SubCategory', 'Payee', 'PaymentMethod', 'Status', 'Description', 'Amount', 'OpeningBalance', 'ClosingBalance', 'Timestamp']
interface GetSheetData {
    transactions: ExpenseSchema[];
    balance: number;
    income: number;
    expenses: number; 
}

interface MasterResp {
    category: CategorySubCategoryGrouped[]
    payments: PaymentMethodsSchema[]
}
    export const instance = axios.create({
        baseURL: 'https://sheets.googleapis.com/v4/spreadsheets'
    });
    instance.interceptors.request.use(function (config) {
        const access_token = getItem(LOCAL_SESSION_KEYS.ACCESS_TOKEN);
        config.headers['Authorization'] = `Bearer ${access_token}`;
        // Do something before request is sent
        return config;
    }, function (error) {
        // Do something with request error
        return Promise.reject(error);
    });

    export const getTransactionsData = async (): Promise<GetSheetData> => {
        let balance = 0;
        let income = 0;
        let expenses = 0;
        try {
            const { data }  = await instance.get(`/${getItem(LOCAL_SESSION_KEYS.SHEET_ID)}/values/${TRANSACTION_SHEET_NAME}!A1:Z1000?majorDimension=ROWS`)
            const values = data.values
            const headers: string[] = values[0] as string[]
            const transactions = [];
            for (let index = values.length - 1; index >= 1; index--) {
                const element = values[index];
                // @ts-ignore
                const obj: ExpenseSchema = {}
                for (let h = 0; h < headers.length; h++) {
                    const header = headers[h] as keyof ExpenseSchema;
                    obj[header] = element[h]
                    if (header === 'Amount') {
                        const val =  Number(element[h])
                        balance += val
                        if (val > 0) {
                            income += val;
                        } else {
                            expenses += val;
                        }
                    }
                }      
                transactions.push(obj);
            }
            return {transactions, balance, income, expenses }
            
        } catch (error) {
            console.log(error)
            return { transactions: [], balance, income, expenses }    
        }
    }

    export const getMasterData = async (): Promise<MasterResp> => {
        
        try {
            const [paymentMethods, category ]  = await Promise.all([
                instance.get(`/${getItem(LOCAL_SESSION_KEYS.SHEET_ID)}/values/${PAYMENT_METHOD_SHEET_NAME}!A1:B99999?majorDimension=ROWS`),
                instance.get(`/${getItem(LOCAL_SESSION_KEYS.SHEET_ID)}/values/${CATEGORY_SUBCATEGORY_SHEET_NAME}!A1:C99999?majorDimension=ROWS`)
            ])
            const paymentMethodsData = paymentMethods.data.values;
            const categoryData = category.data.values
            const headers = paymentMethodsData[0] as (keyof PaymentMethodsSchema)[]
            const headersCategry = categoryData[0] as (keyof CategorySubCategorySchema)[]


            const categoryShemad = getShemaed(headersCategry, categoryData);
            const map: Record<string, CategorySubCategoryGrouped> = {}
            for (let index = 0; index < categoryShemad.length; index++) {
                const element = categoryShemad[index];
                const categoryName = element.CategoryName;
                const sub = {
                    rowId: element.rowId,
                    subCategory: element.SubCategoryName
                }
                if (!map[categoryName]) {
                    map[categoryName] = {
                        categoryName,
                        subCategories: [sub]
                    }
                } else {
                    map[categoryName].subCategories.push(sub) 
                }
            }
            return {
                payments: getShemaed(headers, paymentMethodsData),
                category: Object.values(map)
            }
    } catch (error) {
        console.log(error)
            return {
                payments: [],
                category: []
            }
        }
    }

    export const addTransaction = async (requestData: Omit<ExpenseSchema, 'Id' | 'OpeningBalance' | 'ClosingBalance' | 'Timestamp'>): Promise<any> => {
        const requestInput: string[] = []
        const requestDataWithEx: ExpenseSchema = {
            ...requestData,
            RowId: '=row()',
            OpeningBalance: '=IF(ROW()-1 = 1, 0, INDIRECT(ADDRESS(ROW()-1,COLUMN() + 1,4)))',
            ClosingBalance: `=SUM(INDIRECT(ADDRESS(1,COLUMN() - 2,4)&":"&ADDRESS(ROW()-1,COLUMN() - 2,4))) + ${Number(requestData.Amount)}`,
            Timestamp: "=now()"
        }
        for (let index = 0; index < TRANSACTION_COLUMNS_ORDERS.length; index++) {
            const element = TRANSACTION_COLUMNS_ORDERS[index];
            requestInput.push(requestDataWithEx[element] || '')
        }
         await instance.post(`/${getItem(LOCAL_SESSION_KEYS.SHEET_ID)}/values/${TRANSACTION_SHEET_NAME}!A:Z:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
            majorDimension: "ROWS",
            values: [ requestInput ]
        })
            
    }
    const getShemaed = <T extends string | number | symbol>(headers: T[], values: any[]): Record<T, string>[] => {
        const transactions = []
        for (let index = 1; index < values.length; index++) {
            const element = values[index];
            // @ts-ignore
            const obj: Record<T, string> = {}
            for (let h = 0; h < headers.length; h++) {
                const header = headers[h] as T;
                obj[header] = element[h]
            }      
            transactions.push(obj);
        }
        return transactions
    }
    
    
    