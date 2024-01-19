import React from 'react';
import { Routes, Route } from "react-router-dom";
import { DashBoard } from './pages/dashboard';
import { Transactions } from './pages/transactions';
import { AddTransaction } from './pages/addTransaction';
import { createTheme } from '@mui/material';
import { ThemeProvider } from '@emotion/react';
// import { GoogleOAuthProvider } from '@react-oauth/google';
// import { CLIENT_ID } from './config';
// import { Login } from './pages/Login';
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
  // const { state } = useContext(AuthContext);
  // console.log(state)
  return (
  
      <ThemeProvider theme={theme}>
        <div> Hello </div>
        {/* <GoogleOAuthProvider clientId={CLIENT_ID}>  */}
          {/* <Routes>
            <Route path="/" element={<DashBoard />} />
            <Route path="/transactions" element={<Transactions shopAppHeader={true} />} />
            <Route path="/add" element={<AddTransaction />} />
          </Routes> */}
        {/* </GoogleOAuthProvider> */}
      </ThemeProvider>
  );
}

export default App;
