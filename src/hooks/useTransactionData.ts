import React, { useEffect } from "react";
import { ExpenseSchema } from "../interface/expenses";
import { getTransactionsData } from "../services/gsheet";
import { AuthContext } from "../context/AuthContext";

interface DefaultUseTransactionProps {
    transactions?: ExpenseSchema[]

}
export const useTransactions = ({ transactions: defaultTransactions }: DefaultUseTransactionProps) => {
    const [transactions, setTransactions] = React.useState<ExpenseSchema[]>([]);
    const [loader, setLoader] = React.useState<boolean>(false);
    const [accountBalance, setAccountBalance] = React.useState(0);
    const [credit, setCredit] = React.useState(0);
    const [debit, setDebit] = React.useState(0);
    const { logout } = React.useContext(AuthContext);
    useEffect(() => {
        if (defaultTransactions?.length) {
            setTransactions(defaultTransactions)
        } else {
            loadRecentTransactionsData()
        }
    }, [])

    
    const loadRecentTransactionsData = async () => {
        
        try {
          setLoader(true);
          const { transactions, balance, income, expenses } = await getTransactionsData();
          setTransactions(transactions);
          setCredit(income);
          setAccountBalance(balance);
          setDebit(expenses);
          setLoader(false);
        } catch (error: any) {
          if (error.response.status === 401) {
            logout();
          }
        }
      };
      return {
        transactions,
        loader,
        accountBalance,
        credit,
        debit,
      }
}