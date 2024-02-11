import React, { useContext, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { DashBoard } from './pages/dashboard';
import { Transactions } from './pages/transactions';
import { AddTransaction } from './pages/addTransaction';
import { createTheme } from '@mui/material';
import { ThemeProvider } from '@emotion/react';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { CLIENT_ID } from './config';
import { AuthContext } from './context/AuthContext';
import { Login } from './pages/Login';
import { AppFooter } from './components/AppFooter';
import { TransactionCharts } from './pages/charts';
import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { Profile } from './pages/profile';
import { PrivacyPolicy } from './pages/privacy-policy';
import { TermsAndServices } from './pages/terms-services';
import { AppDrawer } from './components/AppDrawer';
import { masterDataReducer } from './reducers/category';
import { AppContext } from './context/AppContext';
import { MasterDataConfig } from './pages/masterdata';

const theme = createTheme({
  palette: {
    primary: {
      main: '#7F3DFF',
      light: '#8B50FF',
    },
  },
});

function App() {
  const { state, loginIfSessionIsActive } = useContext(AuthContext);
  useEffect(() => {
    loginIfSessionIsActive();
  }, []);
  const [masterDataState, masterDataDispatch] = React.useReducer(masterDataReducer, { categoryAndSubCategories: [] });

  return (
    <ThemeProvider theme={theme}>
      <AppContext.Provider value={{ masterDataState, masterDataDispatch }}>
        <LocalizationProvider dateAdapter={AdapterDayjs}>
          <GoogleOAuthProvider clientId={CLIENT_ID}>
            {state.isLoggedIn ? (
              <div className="hidden md:block">
                <AppDrawer />
              </div>
            ) : null}
            <div className={state.isLoggedIn ? 'md:ml-60' : ''}>
              
              {!state.isLoggedIn ? 
              
              
              <Routes>
                <Route path="/" element={<Login />}></Route>
                <Route path="/privacy-policy" element={<PrivacyPolicy shopAppHeader={true} />} />
                <Route path="/terms-services" element={<TermsAndServices shopAppHeader={true} />} />
                <Route path="*" element={<Navigate replace to="/" />} />
              </Routes> : <Routes>
                <Route path="/home" element={<DashBoard />} />
                <Route path="/transactions" element={<Transactions shopAppHeader={true} />} />
                <Route path="/add" element={<AddTransaction />} />
                <Route path="/charts" element={<TransactionCharts shopAppHeader={true} />} />
                <Route path="/profile" element={<Profile shopAppHeader={true} />} />
                <Route path="/master_config" element={<MasterDataConfig shopAppHeader={true} />} />
                <Route path="*" element={<Navigate replace to="/home" />} />
              </Routes> } 
            </div>

            {state.isLoggedIn ? (
              <div className="md:hidden">
                <AppFooter />
              </div>
            ) : null}
          </GoogleOAuthProvider>
        </LocalizationProvider>
      </AppContext.Provider>
    </ThemeProvider>
  );
}

export default App;
