

import { Box, Paper } from '@mui/material';
import { AppHeader } from '../../components/AppBar';
import React from 'react';
import { useNavigate } from 'react-router-dom';

interface TransactionsProps {
    shopAppHeader: boolean;
}
export const TermsAndServices =  ({shopAppHeader}: TransactionsProps) => {
    const ref = React.useRef<HTMLDivElement>(null);
    const navigate = useNavigate()
return (
    <Box  sx={{ pb: 7 }} ref={ref}>
    {shopAppHeader ? <AppHeader title='Terms & Services' onClickBack={() => navigate(-1)} /> : null } 
    <Paper style={{ padding: 16,  }} elevation={0}>
    
        <h1>Terms of Service for Expense Manager</h1>
        <p><strong>Last updated: 24-Jan-2023</strong></p>
        <p><em></em> We operates the Expense Manager Web App. By accessing or using the Web App, you agree to be bound by these terms and conditions.</p>

        <h2>1. Use of the App</h2>

        <p>By using the Expense Manager App, you agree to use it only for its intended purpose of managing expenses. You must not use the App for any illegal or unauthorized purpose. You are responsible for ensuring that your use of the App complies with applicable laws and regulations.</p>

        <h2>2. Data Storage and Privacy</h2>

        <p>The Expense Manager App uses Google Sheets as the primary storage mechanism for your expense data. Our privacy policy outlines how your data is collected, used, and stored. By using the App, you agree to the terms specified in the privacy policy.</p>

        <h2>3. User Account</h2>

        <p>To use certain features of the App, you may be required to create a user account. You are responsible for maintaining the confidentiality of your account and password. You agree to accept responsibility for all activities that occur under your account.</p>

        <h2>4. Modification of Terms</h2>

        <p>We reserve the right to modify these terms of service at any time. You are advised to review this page periodically for any changes. Your continued use of the App after the changes constitute your acceptance of the new terms.</p>

        <h2>5. Termination</h2>

        <p>We may terminate or suspend access to our App immediately, without prior notice or liability, for any reason whatsoever, including without limitation if you breach the terms.</p>

        <h2>Contact Us</h2>

        <p>If you have any questions or suggestions about our terms of service, do not hesitate to contact us at sathishkrish20@gmail.com</p>
</Paper>
</Box>
)
}