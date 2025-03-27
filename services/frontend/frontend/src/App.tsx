import { Container, CssBaseline, AppBar, Toolbar, Typography, Box, Link, ThemeProvider, createTheme } from '@mui/material';
import { AutoFixHigh } from '@mui/icons-material';
import { MemeProvider } from './context/MemeContext';
import MemeForm from './components/MemeForm';
import MemeGallery from './components/MemeGallery';
import ErrorAlert from './components/ErrorAlert';
import ConnectionStatus from './components/ConnectionStatus';

// Create a theme with custom primary and secondary colors
const theme = createTheme({
  palette: {
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#f50057',
    },
    background: {
      default: '#f5f8fa',
    },
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    h5: {
      fontWeight: 600,
    },
  },
  shape: {
    borderRadius: 8,
  },
  components: {
    MuiPaper: {
      defaultProps: {
        elevation: 0,
      },
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
  },
});

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <MemeProvider>
        <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
          {/* NATS Connection Status (positioned with fixed positioning) */}
          <ConnectionStatus />
          
          {/* App Bar */}
          <AppBar position="static" color="primary" elevation={0}>
            <Toolbar sx={{ display: 'flex', justifyContent: 'center' }}>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <AutoFixHigh sx={{ mr: 1 }} />
                <Typography variant="h6" component="div">
                  Meme Generator
                </Typography>
              </Box>
            </Toolbar>
          </AppBar>
          
          {/* Main Content */}
          <Container 
            maxWidth="md" 
            sx={{ 
              mt: { xs: 2, sm: 3 }, 
              mb: { xs: 2, sm: 3 }, 
              flexGrow: 1
            }}
          >
            <ErrorAlert />
            <MemeForm />
            <MemeGallery />
          </Container>
          
          {/* Footer */}
          <Box 
            component="footer" 
            sx={{ 
              py: 3, 
              mt: 'auto',
              backgroundColor: (theme) => theme.palette.grey[100],
              borderTop: '1px solid',
              borderColor: 'divider'
            }}
          >
            <Container maxWidth="lg">
              <Typography variant="body2" color="text.secondary" align="center">
                {'© '}
                {new Date().getFullYear()}
                {' Meme Generator | Created with '}
                <Link color="inherit" href="https://react.dev/">
                  React
                </Link>
                {' and '}
                <Link color="inherit" href="https://vitejs.dev/">
                  Vite
                </Link>
              </Typography>
            </Container>
          </Box>
        </Box>
      </MemeProvider>
    </ThemeProvider>
  );
}

export default App;
