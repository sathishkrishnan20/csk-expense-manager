import {
  BottomNavigation,
  BottomNavigationAction,
  Paper,
  SpeedDial,
  SpeedDialAction,
  SpeedDialIcon,
} from '@mui/material';

import HomeIcon from '@mui/icons-material/Home';
import TransactionIcon from '@mui/icons-material/DynamicForm';
import BudgetIcon from '@mui/icons-material/PieChart';
import ProfileIcon from '@mui/icons-material/Settings';
import ExpenseIcon from '@mui/icons-material/CreditCardOffOutlined';
import CreditIcon from '@mui/icons-material/AddCardOutlined';
import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export const AppFooter = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const hideCreditDebitButton = pathname === '/add';
  const [value, setValue] = React.useState(0);
  const [open, setOpen] = React.useState(false);
  const handleOpen = () => setOpen(true);
  const handleClose = () => setOpen(false);

  const actions = [
    { icon: <CreditIcon style={{ color: 'white' }} />, name: 'Credit', fabBackgrundColor: 'green' },
    { icon: <ExpenseIcon style={{ color: 'white' }} />, name: 'Debit', fabBackgrundColor: 'red' },
  ];

  return (
    <Paper sx={{ position: 'fixed', bottom: 0, left: 0, right: 0 }} elevation={5}>
      <BottomNavigation
        showLabels
        onChange={(event, newValue) => {
          setValue(newValue);
        }}
        value={value}
      >
        <BottomNavigationAction onClick={() => navigate('/home')} label="Home" icon={<HomeIcon />} />
        <BottomNavigationAction
          onClick={() => navigate('transactions')}
          label="Transactions"
          icon={<TransactionIcon />}
        />

        {hideCreditDebitButton ? null : (
          <SpeedDial
            ariaLabel="Add"
            sx={{ marginTop: -100 }}
            FabProps={{
              style: {
                marginBottom: 20,
                backgroundColor: '#7F3DFF',
                width: 60,
                height: 60,
                borderRadius: 100,
              },
            }}
            onClose={handleClose}
            onOpen={handleOpen}
            open={open}
            icon={<SpeedDialIcon style={{ color: '#FFF', backgroundColor: '#7F3DFF' }} />}
          >
            {actions.map((action) => (
              <SpeedDialAction
                FabProps={{ style: { backgroundColor: action.fabBackgrundColor } }}
                key={action.name}
                icon={action.icon}
                onClick={() => {
                  handleClose();
                  setValue(-1);
                  navigate('/add', { state: { type: action.name.toUpperCase() } });
                }}
                tooltipTitle={action.name}
              />
            ))}
          </SpeedDial>
        )}

        <BottomNavigationAction label="Charts" onClick={() => navigate('charts')} icon={<BudgetIcon />} />
        <BottomNavigationAction label="Config" onClick={() => navigate('master_config')} icon={<ProfileIcon />} />
      </BottomNavigation>
    </Paper>
  );
};
