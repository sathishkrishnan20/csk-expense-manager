import * as React from 'react';
import Box from '@mui/material/Box';
import { Paper, Typography } from '@mui/material';
import { AppHeader } from '../../components/AppBar';
import { useLocation, useNavigate } from 'react-router-dom';
import { ExpenseSchema } from '../../interface/expenses';
import { TransactionNotFound } from '../../components/Transactions/not_found';
import dayjs from 'dayjs';
import { TransactionSkeleton } from '../../components/Transactions/skeleton';
import { useTransactions } from '../../hooks/useTransactionData';

interface TransactionsProps {
  shopAppHeader: boolean;
  transactions?: ExpenseSchema[];
}
export const Transactions = ({ shopAppHeader, transactions: transactionsViaNaviagation }: TransactionsProps) => {
  const navigate = useNavigate();
  const { state } = useLocation();
  const { transactions, loader } = useTransactions({ transactions: transactionsViaNaviagation?.length ? transactionsViaNaviagation : state?.transactions?.length? state?.transactions : [] });
  const ref = React.useRef<HTMLDivElement>(null);

  const getType = (amount?: string) => (Number(amount) >= 0 ? 'CREDIT' : 'DEBIT');
  return (
    <Box sx={{ pb: 7 }} ref={ref}>
      {shopAppHeader ? <AppHeader title="Transactions" onClickBack={() => navigate(-1)} /> : null}
      {loader ? <TransactionSkeleton count={10} /> : transactions.length === 0 ? <TransactionNotFound /> : null}
      <Paper style={{ backgroundColor: 'ActiveBorder' }}>
        {(transactions || []).map((item) => (
          <Paper key={'t' + item.RowId} style={{ padding: 8, marginBottom: 1, borderRadius: 0 }} elevation={3}>
            <div
              onClick={() =>
                navigate('/add', { state: { type: getType(item.Amount), action: 'EDIT', expenseData: item } })
              }
            >
              <Typography style={{ color: 'GrayText' }}>
                {dayjs(item.TransactionDate).format('MMMM DD, YYYY')}
              </Typography>

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography>{item.Payee}</Typography>
                <Typography color={getType(item.Amount) === 'CREDIT' ? 'green' : 'red'} fontWeight={900}>
                  ₹{getType(item.Amount) === 'CREDIT' ? item.Amount : Number(item.Amount) * -1}
                </Typography>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography>
                  {item.Category} : {item.SubCategory}
                </Typography>
                <Typography fontWeight={800}>₹{item.ClosingBalance}</Typography>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography fontWeight={100} fontSize={14}>
                  {item.Description}
                </Typography>
                {item.PaymentMethod ? <Typography fontWeight={200}>{item.PaymentMethod}</Typography> : null}
              </div>
            </div>
          </Paper>
        ))}
      </Paper>
    </Box>
  );
};
