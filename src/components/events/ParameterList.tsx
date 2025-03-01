import { Box, Tooltip, Typography } from '@mui/material';
import { shortenAddress } from '../../utils/address';

interface Parameter {
  name: string;
  value: string;
  type: string;
}

interface ParameterListProps {
  parameters: Parameter[];
}

export const ParameterList: React.FC<ParameterListProps> = ({ parameters }) => {
  return (
    <Box display="flex" flexDirection="column" gap={1}>
      {parameters.map((param, index) => (
        <Box key={index} display="flex" alignItems="center" gap={1}>
          <Typography variant="body2" color="textSecondary">
            {param.name}:
          </Typography>
          {param.type === 'address' ? (
            <Tooltip title={param.value}>
              <Typography variant="body2">
                {shortenAddress(param.value)}
              </Typography>
            </Tooltip>
          ) : (
            <Typography variant="body2">{param.value}</Typography>
          )}
        </Box>
      ))}
    </Box>
  );
}; 