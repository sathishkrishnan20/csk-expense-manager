import React, { useEffect } from "react";
import { ExpenseSchema } from "../interface/expenses";
import { getTransactionsData } from "../services/gsheet";
import { AuthContext } from "../context/AuthContext";
import dayjs, { Dayjs } from "dayjs";

interface DefaultUseTransactionProps {
    transactions?: ExpenseSchema[]
    startDate?: Dayjs;
    endDate?: Dayjs
}

interface SetDataProps {
  transactions: ExpenseSchema[];
  balance: number;
  income: number; 
  expenses: number;
}
export const useTransactions = ({ transactions: defaultTransactions, endDate, startDate }: DefaultUseTransactionProps) => {
    const [transactions, setTransactions] = React.useState<ExpenseSchema[]>([]);
    const [loader, setLoader] = React.useState<boolean>(false);
    const [accountBalance, setAccountBalance] = React.useState(0);
    const [credit, setCredit] = React.useState(0);
    const [debit, setDebit] = React.useState(0);
    const { logout } = React.useContext(AuthContext);
    useEffect(() => {
      loadRecentTransactionsData()
    }, [startDate, endDate])

    
    const calculateExpensesIncomeAndBalanceFromTransactions = (transactions: ExpenseSchema[]) => {
        let balance = 0, income = 0, expenses = 0;
        
        let filteredTransactions = [];
        
        for (const element of transactions) {
          if (startDate) {
            if (dayjs(element.TransactionDate).isAfter(dayjs(startDate).startOf('day')) === false) {
                continue
            }
          }
          if (endDate) {
            if (dayjs(element.TransactionDate).isBefore(dayjs(endDate).endOf('day')) === false) {
                continue
            }
          }
          const val = Number(element.Amount);
          balance += val;
          if (val > 0) {
            income += val;
          } else {
            expenses += val;
          }
          filteredTransactions.push(element)
        }
        return { balance, income, expenses, filteredTransactions }
    }

    const setData = ({ transactions, balance, income, expenses }: SetDataProps) => {
      setTransactions(transactions);
      setCredit(income);
      setAccountBalance(balance);
      setDebit(expenses);
    }
    
    const loadRecentTransactionsData = async () => {
      if (defaultTransactions?.length) {
        const { balance, income, expenses , filteredTransactions } = calculateExpensesIncomeAndBalanceFromTransactions(defaultTransactions)
        setData({ transactions: filteredTransactions,  balance, income, expenses })
      } else {
        try {
          setLoader(true);
          const { transactions } = await getTransactionsData();
          const { balance, income, expenses, filteredTransactions  } = calculateExpensesIncomeAndBalanceFromTransactions(transactions)
          setData({ transactions: filteredTransactions, balance, income, expenses })
          setLoader(false);
        } catch (error: any) {
          if (error.response.status === 401) {
            logout();
          }
        }
      };
    }

    return {
      transactions,
      loader,
      accountBalance,
      credit,
      debit,
    }
}