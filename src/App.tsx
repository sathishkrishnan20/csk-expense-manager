import React, { useContext } from 'react';
import { Routes, Route } from "react-router-dom";
import { DashBoard } from './pages/dashboard';
import { Transactions } from './pages/transactions';
import { AddTransaction } from './pages/addTransaction';
import { createTheme } from '@mui/material';
import { ThemeProvider } from '@emotion/react';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { CLIENT_ID } from './config';
import { AuthContext } from './context/AuthContext';
import { Login } from './pages/Login';
const theme = createTheme({
  palette: {
    primary: {
      main: '#7F3DFF',
      light: '#8B50FF'
    },
  },
});


function App() {
  // @ts-ignore
  const { state } = useContext(AuthContext);
  return (
     <ThemeProvider theme={theme}>
        <GoogleOAuthProvider clientId={CLIENT_ID}> 
          {!state.isLoggedIn ? <Routes> <Route path="/" element={<Login />}> </Route> </Routes> : 
          <Routes>
            <Route path="/" element={<DashBoard />} />
            <Route path="/transactions" element={<Transactions shopAppHeader={true} />} />
            <Route path="/add" element={<AddTransaction />} />
          </Routes> }
        </GoogleOAuthProvider>
      </ThemeProvider>
  );
}

export default App;
