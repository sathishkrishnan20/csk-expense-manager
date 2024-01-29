import { Box, Button, CircularProgress, Paper, Typography } from '@mui/material';
import React, { useContext, useEffect, useState } from 'react';
import { AuthContext } from '../../context/AuthContext';
import { TokenResponse, useGoogleLogin, useGoogleOneTapLogin } from '@react-oauth/google';
import { DEMO_EXPENSE_MANAGER_SHEET_ID, EXPENSE_MANAGER_IMAGE_URL, SCOPES } from '../../config';
import { LOCAL_SESSION_KEYS, getItem, setItem } from '../../context/storage';
import GoolgeIcon from '@mui/icons-material/Google';
import axios from 'axios';
import { getOrSearchExpenseManagerFile } from '../../services/gdrive';
import './style.css';
import { PrivacyPolicyComponent } from '../../components/PrivacyPolicy';

export const Login = () => {
  const ref = React.useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const windowSize = React.useRef([window.innerWidth, window.innerHeight]);
  const { login, setUser, loginIfSessionIsActive } = useContext(AuthContext);
  useEffect(() => {
    loginIfSessionIsActive();
  }, []);

  useGoogleOneTapLogin({
    auto_select: true,
    onSuccess: async (_credentialResponse) => {
      onSubmit();
    },
    onError: () => {
      console.log('Login Failed');
    },
  });
  const onSubmit = useGoogleLogin({
    onSuccess: async (codeResponse) => {
      await onSuccessOfGoogleLogin(codeResponse);
    },
    flow: 'implicit',
    scope: SCOPES,
  });

  const onSubmitDemo = () => {
    setItem(LOCAL_SESSION_KEYS.SHEET_ID, DEMO_EXPENSE_MANAGER_SHEET_ID);
    setUser({
      id: '',
      name: 'Demo',
      picture: EXPENSE_MANAGER_IMAGE_URL,
    });

    const time = new Date();
    time.setMinutes(time.getMinutes() + 15);

    login({
      access_token: '',
      expiry_time: time.getTime(),
    });
  };

  const onSuccessOfGoogleLogin = async (
    codeResponse: Omit<TokenResponse, 'error' | 'error_description' | 'error_uri'>,
  ) => {
    setIsLoading(true);
    const expiryTime = new Date();
    expiryTime.setSeconds(expiryTime.getSeconds() + codeResponse.expires_in - 99);
    const { data } = await axios.get(
      `https://www.googleapis.com/oauth2/v1/userinfo?alt=json&access_token=${codeResponse.access_token}`,
    );
    setItem(LOCAL_SESSION_KEYS.ACCESS_TOKEN, codeResponse.access_token);
    await getExpenseManagerFile();
    setUser({
      id: data.id,
      name: data.name,
      picture: data.picture,
    });
    login({
      access_token: codeResponse.access_token,
      expiry_time: expiryTime.getTime(),
    });
    setIsLoading(false);
  };
  const getExpenseManagerFile = async () => {
    await getOrSearchExpenseManagerFile();
  };
  return (
    <Box sx={{ pb: 7 }} ref={ref}>
      <div className="body-container">
        <Paper className="container" elevation={3}>
          <div className="header-container">
            <div className="header-title">
              <img
                src={EXPENSE_MANAGER_IMAGE_URL}
                alt={'Expense Manager'}
                loading="lazy"
                style={{ maxHeight: 60 }}
                className="header-logo"
              />
              <Typography variant="h4" className="header-title-text" color={'white'}>
                Expense Manager
              </Typography>
            </div>

            <div>
              <Button
                disabled={isLoading}
                startIcon={!isLoading ? <GoolgeIcon /> : null}
                style={{ marginTop: 20, marginBottom: 20 }}
                variant="contained"
                title="Login"
                onClick={() => onSubmit()}
              >
                {isLoading ? <CircularProgress size={25} /> : 'Login'}
              </Button>
              <Button style={{ marginBottom: 20 }} variant="contained" title="Login" onClick={() => onSubmitDemo()}>
                {'Demo'}
              </Button>
            </div>
          </div>
        </Paper>
      </div>
      {/* <div className="container"> 
            <div className="header-container">
            <div className="header-title">
              <img
                  src={EXPENSE_MANAGER_IMAGE_URL}
                  alt={'Expense Manager'}
                  loading="lazy"
                  style={{ maxHeight: 60  }}
              />
                <Typography variant="h4">Expense Manager</Typography>
             </div>
              
            </div>
          </div>   */}
      {/* <Paper className="login-container " style={{ height: windowSize.current[1] }} elevation={3}>
            <img
                src={EXPENSE_MANAGER_IMAGE_URL}
                alt={'Expense Manager'}
                loading="lazy"
                style={{ maxHeight:  windowSize.current[1]  }}
            />
            <Typography className="login-text-header" variant={'h5'}>Gain Total Control of your Money</Typography>
            <div className="login-text-sub-header" style={{ color: 'GrayText',  }}>Become your own money manager and make every cent count</div>
            
            <Button disabled={isLoading} startIcon={!isLoading ? <GoolgeIcon />: null} style={{ marginTop: 20, marginBottom: 20}}  variant="contained"  title="Login" onClick={() => onSubmit()}> {isLoading ? <CircularProgress size={25} /> : 'Login' }  </Button>
            <Button style={{ marginBottom: 20}}  variant="contained"  title="Login" onClick={() => onSubmitDemo()}> Demo </Button>
            
            </Paper>  */}
      <PrivacyPolicyComponent />
    </Box>
  );
};
