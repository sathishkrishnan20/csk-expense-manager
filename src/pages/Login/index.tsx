import { Box, Button, Paper, Typography } from '@mui/material';
import React, { useContext, useEffect, useState } from 'react';
import { AuthContext } from '../../context/AuthContext';
import { TokenResponse, useGoogleLogin } from '@react-oauth/google';
import { APP_TITLE, DEMO_EXPENSE_MANAGER_SHEET_ID, EXPENSE_MANAGER_IMAGE_URL, SCOPES } from '../../config';
import { LOCAL_SESSION_KEYS, setItem } from '../../context/storage';
import axios from 'axios';
import { getOrSearchExpenseManagerFile } from '../../services/gdrive';
import './style.css';
import { PrivacyPolicyComponent } from '../../components/PrivacyPolicy';
import { Header } from './Header';
import expenseSystemPic from '../../static/images/2.webp';
export const Login = () => {
  const ref = React.useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { login, setUser, loginIfSessionIsActive } = useContext(AuthContext);
  useEffect(() => {
    loginIfSessionIsActive();
  }, []);

  // useGoogleOneTapLogin({
  //   auto_select: true,
  //   onSuccess: async (_credentialResponse) => {
  //     onSubmit();
  //   },
  //   onError: () => {
  //     console.log('Login Failed');
  //   },
  // });
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

  const LeftTitle = ({ text }: { text: string }) => (
    <h2 className="body-left-text text-3xl md:text-4xl lg:text-5xl">{text}</h2>
  );
  const LeftSubTitle = ({ text }: { text: string }) => <h4 className="body-left-sub-text">{text}</h4>;

  return (
    <Box sx={{ pb: 7 }} ref={ref}>
      <div className="main-container md:p-16 ">
        <Paper className="w-full header-body-container" elevation={3}>
          <Header isLoading={isLoading} onClickLogin={onSubmit} />
          <div className="border"> </div>

          <div className="body-container flex flex-col md:flex-row-reverse m-3">
            <div>
              <img src={expenseSystemPic} alt={APP_TITLE} loading="lazy" className="max-w-25" />
            </div>

            <div className="">
              <LeftTitle text="Track your" />
              <LeftTitle text="Expenses" />
              <LeftTitle text="To save money" />
              <LeftTitle text=" Without any hassle" />
              <div style={{ marginTop: 20 }}>
                <LeftSubTitle text="Use our App to keep eye on your daily expenses," />
                <LeftSubTitle text={APP_TITLE + ' interface is easy to understand'} />
                <LeftSubTitle text="And can be your best friend in solving your savings" />
              </div>

              <div style={{ marginTop: 10 }}>
                <Button
                  className="w-full"
                  variant="contained"
                  color="inherit"
                  title="Demo"
                  onClick={() => onSubmitDemo()}
                >
                  {'Try Free Demo'}
                </Button>
              </div>
            </div>
          </div>
          <Typography fontFamily={'serif'} className="privacy-info-text">
            We won't save your data on our cloud, We respect your Privacy and We will save your expenses on your Google
            sheet
          </Typography>
        </Paper>
      </div>
      <PrivacyPolicyComponent />
    </Box>
  );
};
