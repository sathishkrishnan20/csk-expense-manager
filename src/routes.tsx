import { createBrowserRouter } from "react-router-dom";
import { DashBoard } from "./pages/dashboard";
import { Transactions } from "./pages/transactions";
import { AddTransaction } from "./pages/addTransaction";

export const AppRoutes = createBrowserRouter([
    {
      path: "/",
      element: <DashBoard />,
    },
    {
        path: "/transactions",
        element: <Transactions />,
    },
    {
        path: "/add",
        element: <AddTransaction />,
    },
  ]);
  