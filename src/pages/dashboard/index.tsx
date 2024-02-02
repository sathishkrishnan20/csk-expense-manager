import * as React from 'react';
import Box from '@mui/material/Box';

import ExpenseIcon from '@mui/icons-material/CreditCardOffOutlined';
import CreditIcon from '@mui/icons-material/AddCardOutlined';

import NotificationIcon from '@mui/icons-material/PowerSettingsNew';
import { Avatar, Chip, CssBaseline, Paper, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import { Transactions } from '../transactions';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import { getTransactionsData } from '../../services/gsheet';
import { ExpenseSchema } from '../../interface/expenses';
import { TransactionSkeleton } from '../../components/Transactions/skeleton';
import { TransactionNotFound } from '../../components/Transactions/not_found';
import './styles.css';
import { EXPENSE_MANAGER_IMAGE_URL } from '../../config';

const Div = styled('div')(({ theme }) => ({
  ...theme.typography.button,
  padding: theme.spacing(1),
  color: 'white',
  fontFamily: '',
}));

export const DashBoard = () => {
  const { logout, state } = React.useContext(AuthContext);
  const navigate = useNavigate();
  const [transactions, setTransactions] = React.useState<ExpenseSchema[]>([]);
  const [accountBalance, setAccountBalance] = React.useState(0);
  const [credit, setCredit] = React.useState(0);
  const [debit, setDebit] = React.useState(0);
  const [loader, setLoader] = React.useState<boolean>(false);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    loadRecentTransactionsData();
  }, []);

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
  const onLogout = () => {
    logout();
  };
  const naviageToTransactionsPage = () => navigate('/transactions', { state: { transactions } });
  return (
    <Box sx={{ pb: 0 }} ref={ref}>
      <CssBaseline />
     
      <Paper className="summary-container" elevation={3}>
        <div className="fx fx-jc-sb m-lr-20">
          <Avatar alt={state?.userInfo?.name} src={state?.userInfo?.picture ? state?.userInfo?.picture : EXPENSE_MANAGER_IMAGE_URL} />
          <Div></Div>
          <button onClick={() => onLogout()}>
            <NotificationIcon className="logout-icon text-white" />
          </button>
        </div>
        <div className="fx fx-jc-sb m-lr-20">
          <div></div>
          <div className="acc-bal-text">{'Account Balance'}</div>
          <div></div>
        </div>
        <div className="fx fx-jc-sb m-lr-20" style={{ marginTop: -12 }}>
          <div></div>
          <div className="acc-bal">₹{accountBalance}</div>
          <div></div>
        </div>
      </Paper>
      {/* <Paper elevation={3}>
         <CircleChat />
      </Paper> */}
      <Paper className='' style={{ padding: 16 }} elevation={1}>
        <div className="fx fx-jc-sb fx-g-20">
          <div
            onClick={() => navigate('/add', { state: { type: 'CREDIT' } })}
            className="fx credit-debit-card-container"
            style={{ backgroundColor: '#00A86B' }}
          >
            <CreditIcon className="credit_debit_icn" />
            <div className="m-l-8">
              <div className="text">{'Income'}</div>
              <div className="amount">₹{credit}</div>
            </div>
          </div>
          <div
            onClick={() => navigate('/add', { state: { type: 'DEBIT' } })}
            className="fx credit-debit-card-container"
            style={{ backgroundColor: '#FD3C4A' }}
          >
            <ExpenseIcon className="credit_debit_icn" />
            <div className="m-l-8">
              <div className="text">{'Expenses'}</div>
              <div className="amount">₹{debit}</div>
            </div>
          </div>
        </div>
      </Paper>

      

      <CssBaseline />
      <Paper style={{ marginTop: 4 }} elevation={0}>
        <div className="fx fx-jc-sb" style={{ marginLeft: 6, marginBottom: 4 }}>
          <Typography fontWeight={800}> Recent Transactions </Typography>
          <div onClick={() => naviageToTransactionsPage()}>
            <Chip style={{ color: '#7F3DFF', backgroundColor: '#EEE5FF' }} label="See All" />
          </div>
        </div>
        {transactions?.length ? (
          <Transactions shopAppHeader={false} transactions={transactions.slice(0, 5)} />
        ) : loader ? (
          <TransactionSkeleton count={10} />
        ) : (
          <TransactionNotFound />
        )}
      </Paper>
    </Box>
  );
};
