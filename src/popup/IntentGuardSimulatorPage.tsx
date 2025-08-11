import React from 'react';
import {
  Box,
  Typography,
  Stack,
  Paper,
  Divider
} from '@mui/material';

export default function IntentGuardSimulatorPage() {
  return (
    <Box
      sx={{
        width: 400,
        minHeight: '100vh',
        p: 4,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'grey.100',
      }}
    >
      <Paper
        elevation={3}
        sx={{
          width: 300,
          maxWidth: 300,
          mx: 'auto',
          borderRadius: 3,
          p: 6,
          backgroundColor: 'background.paper',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
          textAlign: 'center',
        }}
      >
        {/* Header */}
        <Stack spacing={4} alignItems="center">
          <Typography 
            variant="h3" 
            component="h1" 
            fontWeight="bold"
            sx={{ color: 'primary.main' }}
          >
            IntentGuard Simulator
          </Typography>
          
          <Divider sx={{ width: '100%' }} />
          
          {/* Logo Placeholder */}
          <Box
            sx={{
              width: 120,
              height: 120,
              backgroundColor: 'grey.200',
              borderRadius: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '2px dashed',
              borderColor: 'grey.400',
            }}
          >
            <Typography variant="body2" color="text.secondary">
              Logo Placeholder
            </Typography>
          </Box>
          
          <Typography variant="h6" color="text.secondary" sx={{ mt: 2 }}>
            Transaction processing complete
          </Typography>
          
          <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 400 }}>
            Your transaction has been processed. IntentGuard is continuously monitoring 
            for potential threats to keep your assets safe.
          </Typography>
        </Stack>
      </Paper>
    </Box>
  );
};
