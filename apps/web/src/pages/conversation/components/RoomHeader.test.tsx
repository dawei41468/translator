import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { RoomHeader } from './RoomHeader';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: any) => {
      if (typeof opts === 'object' && opts !== null && 'defaultValue' in opts) {
        return String(opts.defaultValue).replace('{{count}}', String(opts.count ?? ''));
      }
      return key;
    },
  }),
}));

describe('RoomHeader participants', () => {
  it('shows participant count and lists participants with You on top', () => {
    render(
      <RoomHeader
        roomCode="ABC-123"
        connectionStatus="connected"
        audioEnabled={true}
        toggleAudio={vi.fn()}
        onLeave={vi.fn()}
        userLanguage="en"
        onUpdateLanguage={vi.fn()}
        isUpdatingLanguage={false}
        isSettingsOpen={false}
        onSettingsOpenChange={vi.fn()}
        isRecording={false}
        hasOtherParticipants={true}
        soloMode={false}
        toggleSoloMode={vi.fn()}
        soloTargetLang="es"
        onSoloLangChange={vi.fn()}
        participants={[
          { id: 'u2', name: 'Alice', language: 'es' },
          { id: 'u1', name: 'Bob', language: 'en' },
        ]}
        currentUserId="u1"
      />
    );

    expect(screen.getByText('(2)')).toBeInTheDocument();

    const btn = screen.getByRole('button', { name: /participants/i });
    fireEvent.click(btn);

    const rows = screen.getAllByTestId('participant-row');
    expect(rows).toHaveLength(2);

    expect(within(rows[0]).getByText(/Bob/)).toBeInTheDocument();
    expect(within(rows[0]).getByText(/participants\.you/)).toBeInTheDocument();

    expect(within(rows[1]).getByText('Alice')).toBeInTheDocument();
  });
});
