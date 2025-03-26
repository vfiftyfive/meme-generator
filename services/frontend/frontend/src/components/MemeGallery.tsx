import { 
  Box, 
  Typography, 
  Grid, 
  Card, 
  CardMedia, 
  CardContent, 
  IconButton, 
  Tooltip,
  Paper,
  Button
} from '@mui/material';
import { Download, ClearAll } from '@mui/icons-material';
import { useMeme } from '../context/MemeContext';

const MemeGallery = () => {
  const { memes, clearGallery } = useMeme();

  // Function to download a meme image
  const downloadMeme = (base64Data: string, prompt: string) => {
    const link = document.createElement('a');
    link.href = `data:image/png;base64,${base64Data}`;
    link.download = `meme-${prompt.substring(0, 20).replace(/\s+/g, '-')}-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (memes.length === 0) {
    return null;
  }

  return (
    <Paper elevation={3} sx={{ 
      mt: 4, 
      p: 3, 
      borderRadius: 2
    }}>
      <Box sx={{ 
        display: 'flex', 
        flexDirection: 'row',
        justifyContent: 'space-between', 
        alignItems: 'center',
        mb: 3 
      }}>
        <Typography 
          variant="h5" 
          component="h2" 
          sx={{ 
            mb: 0,
            fontWeight: 600
          }}
        >
          Your Meme Gallery
        </Typography>
        <Tooltip title="Clear all memes">
          <Button 
            startIcon={<ClearAll />} 
            onClick={clearGallery}
            variant="outlined"
            size="small"
            color="secondary"
            sx={{ borderRadius: 2 }}
          >
            Clear All
          </Button>
        </Tooltip>
      </Box>

      <Grid container spacing={3}>
        {memes.map((meme) => (
          <Grid item xs={12} sm={6} md={4} lg={3} key={meme.request_id}>
            <Card sx={{ 
              height: '100%', 
              display: 'flex', 
              flexDirection: 'column',
              borderRadius: 2,
              transition: 'all 0.3s',
              boxShadow: 2,
              '&:hover': {
                transform: 'translateY(-4px)',
                boxShadow: 6
              },
              overflow: 'hidden'
            }}>
              <CardMedia
                component="img"
                image={`data:image/png;base64,${meme.image_data}`}
                alt={meme.prompt}
                sx={{ 
                  aspectRatio: '1/1',
                  objectFit: 'cover'
                }}
              />
              <CardContent sx={{ flexGrow: 1 }}>
                <Box sx={{ 
                  display: 'flex', 
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  mb: 1
                }}>
                  <Typography 
                    variant="caption" 
                    color="text.secondary" 
                    sx={{ fontSize: { xs: '0.7rem', sm: '0.75rem' } }}
                  >
                    {new Date(meme.timestamp * 1000).toLocaleString()}
                  </Typography>
                </Box>
                <Typography 
                  variant="subtitle1" 
                  component="div" 
                  sx={{ 
                    height: '3em', 
                    overflow: 'hidden', 
                    textOverflow: 'ellipsis', 
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    fontSize: { xs: '0.9rem', sm: '1rem' },
                    fontWeight: 500
                  }}
                >
                  {meme.prompt}
                </Typography>
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
                  <Tooltip title="Download meme">
                    <IconButton 
                      onClick={() => downloadMeme(meme.image_data, meme.prompt)}
                      size="small"
                    >
                      <Download />
                    </IconButton>
                  </Tooltip>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Paper>
  );
};

export default MemeGallery;
