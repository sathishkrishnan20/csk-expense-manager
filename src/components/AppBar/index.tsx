import * as React from 'react';
import { AppBar, IconButton, Toolbar, Typography } from "@mui/material";
import BackIcon from '@mui/icons-material/ArrowBack';

interface AppHeaderProps {
    title: string;
    onClickBack: () => void
}
export const AppHeader = ({ title, onClickBack }: AppHeaderProps) => ( 
    <AppBar position="static">
        <Toolbar>
        <IconButton
            onClick={onClickBack}
            size="large"
            edge="start"
            color="inherit"
            aria-label="menu"
            sx={{ mr: 2 }}
            >
            
            <BackIcon />
        </IconButton>
        <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            {title}
        </Typography>
        </Toolbar>
    </AppBar>)