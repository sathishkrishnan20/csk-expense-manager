import { Button, CircularProgress, Typography } from '@mui/material';
import { APP_TITLE, EXPENSE_MANAGER_IMAGE_URL } from '../../config';
import GoolgeIcon from '@mui/icons-material/Google';
import './style.css';

interface HeaderProps {
  isLoading: boolean;
  onClickLogin: () => void;
  onClickDemo: () => void;
}
export const Header = ({ isLoading, onClickLogin, onClickDemo }: HeaderProps) => {
  return (
    <div className="header-container">
      <div className="header-title">
        <img
          src={EXPENSE_MANAGER_IMAGE_URL}
          alt={APP_TITLE}
          loading="lazy"
          style={{ maxHeight: 60 }}
          className="header-logo"
        />

        <Typography variant="h5" className="header-title-text" color={'white'}>
          {APP_TITLE}
        </Typography>
      </div>

      <div className="header-right-buttons">
        <Button
          disabled={isLoading}
          startIcon={!isLoading ? <GoolgeIcon /> : null}
          variant="contained"
          title="Login"
          onClick={() => onClickLogin()}
        >
          {isLoading ? <CircularProgress size={25} /> : 'Login'}
        </Button>
      </div>
    </div>
  );
};
