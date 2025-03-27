import { useState, useEffect } from 'react';
import { Box, Typography, Tooltip, Paper, Chip } from '@mui/material';
import natsService from '../services/NatsService';

/**
 * Small indicator component that shows NATS connection status
 * Useful for debugging connection issues across environments
 */
export default function ConnectionStatus() {
  const [isConnected, setIsConnected] = useState(false);
  const [serverUrl, setServerUrl] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  
  useEffect(() => {
    // Check connection status every second
    const checkConnection = () => {
      setIsConnected(natsService.isConnected());
      setServerUrl(natsService.getServerUrl());
    };
    
    // Check immediately and then periodically
    checkConnection();
    const interval = setInterval(checkConnection, 1000);
    
    return () => clearInterval(interval);
  }, []);
  
  if (!showDetails) {
    return (
      <Tooltip title="Click for connection details">
        <Chip
          size="small"
          label={isConnected ? "Connected" : "Disconnected"}
          color={isConnected ? "success" : "error"}
          sx={{ position: 'fixed', bottom: '10px', right: '10px', cursor: 'pointer' }}
          onClick={() => setShowDetails(true)}
        />
      </Tooltip>
    );
  }
  
  return (
    <Paper 
      elevation={3}
      sx={{ 
        position: 'fixed', 
        bottom: '10px', 
        right: '10px', 
        padding: 2,
        maxWidth: '300px',
        zIndex: 1000
      }}
    >
      <Typography variant="subtitle2" gutterBottom>
        NATS Connection Status
      </Typography>
      
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Typography variant="body2">Status:</Typography>
          <Chip 
            size="small" 
            label={isConnected ? "Connected" : "Disconnected"} 
            color={isConnected ? "success" : "error"} 
          />
        </Box>
        
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Typography variant="body2">Server:</Typography>
          <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>
            {serverUrl}
          </Typography>
        </Box>
        
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Typography variant="body2">Time:</Typography>
          <Typography variant="body2">
            {new Date().toISOString()}
          </Typography>
        </Box>
      </Box>
      
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
        <Chip 
          size="small" 
          label="Hide" 
          onClick={() => setShowDetails(false)}
          sx={{ cursor: 'pointer' }}
        />
      </Box>
    </Paper>
  );
}
