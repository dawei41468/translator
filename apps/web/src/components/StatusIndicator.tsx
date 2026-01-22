import React from 'react';

export type ParticipantStatus = 'active' | 'away' | 'disconnected';

interface StatusIndicatorProps {
  status: ParticipantStatus;
  lastSeen?: Date;
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({
  status,
  lastSeen
}) => {
  const getStatusColor = () => {
    switch (status) {
      case 'active': return 'bg-green-500';
      case 'away': return 'bg-yellow-500';
      case 'disconnected': return 'bg-gray-500';
      default: return 'bg-gray-400';
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'active': return 'Active';
      case 'away': return 'Away';
      case 'disconnected': return 'Disconnected';
      default: return 'Unknown';
    }
  };

  const getLastSeenText = () => {
    if (!lastSeen) return '';
    const diff = Date.now() - new Date(lastSeen).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <div className="flex items-center gap-2">
      <div
        className={`w-2 h-2 rounded-full ${getStatusColor()}`}
        title={getStatusText()}
      />
      <span className="text-xs text-muted-foreground">
        {getStatusText()}
        {lastSeen && status !== 'active' && (
          <span className="ml-1 text-xs opacity-75">
            ({getLastSeenText()})
          </span>
        )}
      </span>
    </div>
  );
};