import { Alert, Snackbar, IconButton } from '@mui/material';
import { Close } from '@mui/icons-material';
import { useMeme } from '../context/MemeContext';

const ErrorAlert = () => {
  const { error, clearError } = useMeme();

  if (!error) return null;

  return (
    <Snackbar
      open={!!error}
      autoHideDuration={6000}
      onClose={clearError}
      anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
    >
      <Alert
        severity="error"
        action={
          <IconButton
            aria-label="close"
            color="inherit"
            size="small"
            onClick={clearError}
          >
            <Close fontSize="inherit" />
          </IconButton>
        }
        sx={{ width: '100%' }}
      >
        {error}
      </Alert>
    </Snackbar>
  );
};

export default ErrorAlert;
