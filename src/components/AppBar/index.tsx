import * as React from 'react';
import { AppBar, Button, IconButton, Toolbar, Typography } from '@mui/material';
import BackIcon from '@mui/icons-material/ArrowBack';

interface AppHeaderProps {
  title: string;
  onClickBack: () => void;
  onClickRightButton?: () => void;
  rightButtonAsIconComponent?: any;
}
export const AppHeader = ({ title, onClickBack, onClickRightButton, rightButtonAsIconComponent }: AppHeaderProps) => (
  <AppBar position="sticky">
    <Toolbar>
      <IconButton onClick={onClickBack} size="large" edge="start" color="inherit" aria-label="menu" sx={{ mr: 2 }}>
        <BackIcon />
      </IconButton>
      <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
        {title}
      </Typography>
      {rightButtonAsIconComponent ? rightButtonAsIconComponent : null}
      {onClickRightButton && !rightButtonAsIconComponent ? (
        <Button onClick={() => onClickRightButton()} color="inherit">
          Done
        </Button>
      ) : null}
    </Toolbar>
  </AppBar>
);
