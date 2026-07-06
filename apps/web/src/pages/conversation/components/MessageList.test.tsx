import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MessageList } from './MessageList';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('MessageList', () => {
  it('renders a translated message with target language label', () => {
    render(
      <MessageList
        messages={[
          {
            id: 'utt_1',
            utteranceId: 'utt_1',
            text: 'ciao',
            isOwn: false,
            timestamp: new Date('2026-01-01T00:00:00.000Z'),
            speakerName: 'Alice',
            speakerId: 'user-2',
            sourceLang: 'en',
            targetLang: 'it',
            isTranslation: true,
          },
        ]}
        currentUserId="user-1"
      />
    );

    expect(screen.getByTestId('message-text')).toHaveTextContent('ciao');
    expect(screen.getByTestId('chat-message')).toHaveAttribute('data-is-own', 'false');
  });

  it('renders an own source message with source language label', () => {
    render(
      <MessageList
        messages={[
          {
            id: 'utt_2',
            utteranceId: 'utt_2',
            text: 'hello',
            isOwn: true,
            timestamp: new Date('2026-01-01T00:00:00.000Z'),
            speakerName: 'You',
            speakerId: 'user-1',
            sourceLang: 'en',
            isTranslation: false,
          },
        ]}
        currentUserId="user-1"
      />
    );

    expect(screen.getByTestId('message-text')).toHaveTextContent('hello');
    expect(screen.getByTestId('chat-message')).toHaveAttribute('data-is-own', 'true');
  });
});
