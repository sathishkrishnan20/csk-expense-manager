import NotificationIcon from '@mui/icons-material/PowerSettingsNew';
import { Box, Paper } from '@mui/material';
import { styled } from '@mui/material/styles';
import { AppHeader } from '../../components/AppBar';
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
const Div = styled('div')(({ theme }) => ({
  ...theme.typography.button,
  padding: theme.spacing(1),
}));

interface TransactionsProps {
  shopAppHeader: boolean;
}
export const Profile = ({ shopAppHeader }: TransactionsProps) => {
  const { logout, state } = React.useContext(AuthContext);
  const ref = React.useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  return (
    <Box sx={{ pb: 7 }} ref={ref}>
      {shopAppHeader ? (
        <AppHeader
          title="Profile"
          onClickBack={() => navigate(-1)}
          rightButtonAsIconComponent={
            <div
              onClick={() => {
                logout();
              }}
            >
              <NotificationIcon style={{ fontSize: 30 }} />
            </div>
          }
        />
      ) : null}

      <Paper style={{ padding: 16 }} elevation={0}>
        <div className="fx fx-jc-sb m-lr-20">
          <div></div>
          <img src={state?.userInfo?.picture} alt={state?.userInfo?.name} loading="lazy" />
          <div></div>
        </div>

        <div className="fx fx-jc-sb m-lr-20">
          <div></div>
          <Div style={{ color: 'GrayText' }}>{state?.userInfo?.name}</Div>
          <div></div>
        </div>
      </Paper>
    </Box>
  );
};
