import * as React from 'react';
import Drawer from '@mui/material/Drawer';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import { AuthContext } from '../../context/AuthContext';
import { APP_TITLE, EXPENSE_MANAGER_IMAGE_URL } from '../../config';
import './style.css';

import HomeIcon from '@mui/icons-material/Home';
import TransactionIcon from '@mui/icons-material/DynamicForm';
import BudgetIcon from '@mui/icons-material/PieChart';
import ProfileIcon from '@mui/icons-material/AccountCircle';
import { useNavigate } from 'react-router-dom';

export const AppDrawer = () => {
  const { logout, state } = React.useContext(AuthContext);
  const drawerWidth = 240;
  const navigate = useNavigate();
  const menus = [
    { title: 'Dashboard', Icon: HomeIcon, navigationLink: '/home' },
    { title: 'Transactions', Icon: TransactionIcon, navigationLink: '/transactions' },
    { title: 'Charts', Icon: BudgetIcon, navigationLink: '/charts' },
    { title: 'Profile', Icon: ProfileIcon, navigationLink: '/profile' },
  ];
  return (
    <Drawer
      sx={{
        width: drawerWidth,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: drawerWidth,
          boxSizing: 'border-box',
        },
      }}
      variant="permanent"
      anchor="left"
    >
      <div className="drawer-container h-full shadow-inner">
        <div className="header-title">
          <img
            src={EXPENSE_MANAGER_IMAGE_URL}
            alt={APP_TITLE}
            loading="lazy"
            style={{ maxHeight: 47 }}
            className="mx-2 my-2 rounded-md"
          />

          <Typography variant="h6" className="header-title-text" color={'white'}>
            {APP_TITLE}
          </Typography>
        </div>
        <div className="border"> </div>

        <div className="fx justify-center mt-10">
          <img className="rounded-xl max-w-40" alt={state?.userInfo?.name} src={state?.userInfo?.picture} />
        </div>
        <div className="fx justify-center mt-2 mb-8">
          <Typography variant="h6" color={'white'}>
            {state?.userInfo?.name}
          </Typography>
        </div>
        <Divider />
        <div className="flex flex-col mx-6 mt-8">
          {menus.map(({ title, Icon, navigationLink }, index) => (
            <button
              onClick={() => navigate(navigationLink)}
              key={title}
              type="button"
              className="flex gap-x-2 shadow bg-white hover:bg-purple-600 hover:text-white text-purple-700  font-medium rounded-full text-sm px-5 py-2.5 text-center mb-2"
            >
              <Icon />
              <h6>{title}</h6>
            </button>
          ))}
        </div>
      </div>
    </Drawer>
  );
};
