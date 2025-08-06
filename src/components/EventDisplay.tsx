import React from 'react';
import { Box, Typography, Chip } from '@mui/material';
import { EventContext, ContractEvents } from '../types/simulation_interfaces';
import { EventParameter } from 'types/simulation_interfaces';
import { shortenAddress } from '../utils/address';

interface EventDisplayProps {
  contractEvents: ContractEvents;
}

export const EventDisplay: React.FC<EventDisplayProps> = ({ contractEvents }) => {
  return (
    <Box>
      {Object.entries(contractEvents).map(([contractAddress, events]) => (
        <Box key={contractAddress} mb={3}>
          <Typography variant="subtitle1" gutterBottom>
            Contract: <Chip label={shortenAddress(contractAddress)} size="small" />
          </Typography>
          
          {events.map((event: EventContext, eventIndex: number) => (
            <Box key={eventIndex} ml={2} mb={2}>
              <Typography variant="body2" color="text.secondary">
                {event.eventName}
              </Typography>
              {event.parameters.map((param: EventParameter, paramIndex: number) => (
                <Box key={paramIndex} ml={2} display="flex" gap={1}>
                  <Typography variant="body2" color="text.secondary">
                    {param.name}:
                  </Typography>
                  <Typography variant="body2">
                    {param.type === 'address' ? shortenAddress(param.value) : param.value}
                  </Typography>
                </Box>
              ))}
            </Box>
          ))}
        </Box>
      ))}
    </Box>
  );
};

export default EventDisplay; 