import { useState } from 'react';
import { 
  Box, 
  TextField, 
  Button, 
  FormControlLabel, 
  Switch, 
  Card, 
  CardContent, 
  Typography,
  CircularProgress,
  Tooltip,
  Paper
} from '@mui/material';
import { FlashOn, AspectRatio, Send, Help } from '@mui/icons-material';
import { useMeme } from '../context/MemeContext';

const MemeForm = () => {
  const { generateMeme, loading } = useMeme();
  const [prompt, setPrompt] = useState('');
  const [fastMode, setFastMode] = useState(true);
  const [smallImage, setSmallImage] = useState(true);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;
    
    await generateMeme(prompt.trim(), fastMode, smallImage);
  };

  return (
    <Paper elevation={3} sx={{ 
      mb: 4, 
      p: 3,
      borderRadius: 2
    }}>
      <Typography 
        variant="h5" 
        component="h1" 
        gutterBottom 
        sx={{ 
          textAlign: 'center',
          mb: 2,
          fontWeight: 600
        }}
      >
        Create Your Meme
      </Typography>
      
      <form onSubmit={handleSubmit}>
        <TextField
          fullWidth
          label="Enter your meme idea"
          variant="outlined"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g., cat programmer debugging code"
          margin="normal"
          disabled={loading}
          required
          sx={{ mb: 2 }}
          InputProps={{
            sx: { borderRadius: 2, fontSize: { xs: '0.9rem', sm: '1rem' } }
          }}
        />
        
        <Box sx={{ mt: 3 }}>
          <Box sx={{ 
            display: 'flex', 
            flexDirection: { xs: 'column', sm: 'row' }, 
            gap: 2,
            mb: 3
          }}>
            <Tooltip title="Faster generation with slightly lower quality">
              <FormControlLabel
                control={
                  <Switch 
                    checked={fastMode} 
                    onChange={(e) => setFastMode(e.target.checked)}
                    color="primary"
                  />
                }
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <FlashOn fontSize="small" sx={{ mr: 0.5 }} />
                    <Typography variant="body2">Fast Mode</Typography>
                  </Box>
                }
                disabled={loading}
              />
            </Tooltip>
            
            <Tooltip title="Generate a smaller 512x512 image instead of 1024x1024">
              <FormControlLabel
                control={
                  <Switch 
                    checked={smallImage} 
                    onChange={(e) => setSmallImage(e.target.checked)}
                    color="primary"
                  />
                }
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <AspectRatio fontSize="small" sx={{ mr: 0.5 }} />
                    <Typography variant="body2">Small Image</Typography>
                  </Box>
                }
                disabled={loading}
              />
            </Tooltip>
          </Box>
          
          <Box sx={{ display: 'flex', justifyContent: 'center', width: '100%', mt: 2 }}>
            <Button 
              type="submit" 
              variant="contained" 
              color="primary" 
              disabled={loading || !prompt.trim()} 
              sx={{ 
                borderRadius: 2,
                px: 3,
                py: 1,
                fontSize: '0.9rem',
                minWidth: '160px'
              }}
              startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <Send fontSize="small" />}
            >
              {loading ? 'Generating...' : 'Generate Meme'}
            </Button>
          </Box>
        </Box>
      </form>
      
      {loading && (
        <Card sx={{ mt: 4, textAlign: 'center', borderRadius: 2, bgcolor: '#f5f5f5' }}>
          <CardContent>
            <CircularProgress size={40} sx={{ mb: 2 }} />
            <Typography variant="h6">
              Creating your meme...
            </Typography>
            <Typography variant="body2" color="textSecondary">
              This may take 15-30 seconds. Please wait.
            </Typography>
          </CardContent>
        </Card>
      )}
      
      <Box sx={{ mt: 2, display: 'flex', alignItems: 'center' }}>
        <Help fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} />
        <Typography variant="caption" color="text.secondary">
          Tip: For best results, be specific and descriptive in your prompt.
        </Typography>
      </Box>
    </Paper>
  );
};

export default MemeForm;
