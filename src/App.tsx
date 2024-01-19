import React from 'react';
import { Routes, Route } from "react-router-dom";
import { DashBoard } from './pages/dashboard';
import { Transactions } from './pages/transactions';
import { AddTransaction } from './pages/addTransaction';
import { createTheme } from '@mui/material';
import { ThemeProvider } from '@emotion/react';
const theme = createTheme({
  palette: {
    primary: {
      main: '#7F3DFF',
      light: '#8B50FF'
    },
  },
});


function App() {
  return (
    <ThemeProvider theme={theme}>
      <Routes>
        <Route path="/" element={<DashBoard />} />
        <Route path="/transactions" element={<Transactions shopAppHeader={true} />} />
        <Route path="/add" element={<AddTransaction />} />
    </Routes>
    </ThemeProvider>
  );
}

export default App;
