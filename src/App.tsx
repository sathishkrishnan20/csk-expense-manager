import React from 'react';
import { Routes, Route } from "react-router-dom";
import { DashBoard } from './pages/dashboard';
import { Transactions } from './pages/transactions';
import { AddTransaction } from './pages/addTransaction';

function App() {
  return (
    <Routes>
      <Route path="/" element={<DashBoard />} />
      <Route path="/transactions" element={<Transactions />} />
      <Route path="/add" element={<AddTransaction />} />
    </Routes>
  );
}

export default App;
