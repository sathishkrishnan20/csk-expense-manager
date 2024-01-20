
import { BottomNavigation, BottomNavigationAction, Paper, SpeedDial, SpeedDialAction, SpeedDialIcon } from '@mui/material';

import HomeIcon from '@mui/icons-material/Home';
import TransactionIcon from '@mui/icons-material/DynamicForm';
// import BudgetIcon from '@mui/icons-material/PieChart'
// import ProfileIcon from '@mui/icons-material/AccountCircle';
import ExpenseIcon from '@mui/icons-material/CreditCardOffOutlined'
import CreditIcon from '@mui/icons-material/AddCardOutlined';
import React from 'react';
import { useNavigate } from 'react-router-dom';

export const AppFooter = () => {
    const navigate = useNavigate();
    const [value, setValue] = React.useState(0);
    const actions = [
        { icon: <ExpenseIcon style={{color: 'white'}} />, name: 'Debit', fabBackgrundColor: 'red' },
        { icon: <CreditIcon  style={{color: 'white'}} />, name: 'Credit', fabBackgrundColor: 'green' }
    ];
    
    return (
        <Paper sx={{ position: 'fixed', bottom: 0, left: 0, right: 0 }} elevation={5}>
        <BottomNavigation
          showLabels
          onChange={(event, newValue) => {
            setValue(newValue);
          }}
          value={value}>
            <BottomNavigationAction onClick={()=> navigate('/')} label="Home" icon={<HomeIcon />} />
            <SpeedDial
                ariaLabel="Add"
                sx={{ marginTop: -100 }}
                FabProps={{ style: { 
                    marginBottom: 20, 
                    backgroundColor: '#7F3DFF',
                    width: 60,
                    height: 60, 
                    borderRadius: 100, 
                }}}
                icon={<SpeedDialIcon style={{color: '#FFF', backgroundColor: '#7F3DFF'}} />}>
                {actions.map((action) => (
                  <SpeedDialAction
                    FabProps={{ style: { backgroundColor: action.fabBackgrundColor}}}
                    key={action.name}
                    icon={action.icon}
                    onClick={() => navigate('/add', { state: { type: action.name.toUpperCase() }})}
                    tooltipTitle={action.name}
                  />
                ))}
            </SpeedDial>
            <BottomNavigationAction onClick={()=> navigate('transactions')} label="Transactions" icon={<TransactionIcon />} />
            
            {/* <BottomNavigationAction label="Budget" icon={<BudgetIcon />} />
            <BottomNavigationAction label="Profile" icon={<ProfileIcon />} /> */}
        </BottomNavigation>
    </Paper>

    )
}