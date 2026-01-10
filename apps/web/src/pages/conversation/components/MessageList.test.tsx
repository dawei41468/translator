import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MessageList } from './MessageList';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('MessageList', () => {
  it('renders a translated message with original section when translatedText differs', () => {
    render(
      <MessageList
        messages={[
          {
            id: '1',
            text: 'hello',
            translatedText: 'ciao',
            isOwn: false,
            timestamp: new Date('2026-01-01T00:00:00.000Z'),
            speakerName: 'Alice',
          },
        ]}
      />
    );

    expect(screen.getByTestId('message-translated-text')).toHaveTextContent('ciao');
    expect(screen.queryByTestId('message-original-text')).toBeNull();
    expect(screen.getByTestId('toggle-original-text')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('toggle-original-text'));
    expect(screen.getByTestId('message-original-text')).toHaveTextContent('hello');
  });

  it('renders a passthrough message (same-language) as a single text block', () => {
    render(
      <MessageList
        messages={[
          {
            id: '1',
            text: 'hello',
            translatedText: 'hello',
            isOwn: false,
            timestamp: new Date('2026-01-01T00:00:00.000Z'),
            speakerName: 'Alice',
          },
        ]}
      />
    );

    expect(screen.getByTestId('message-text')).toHaveTextContent('hello');
    expect(screen.queryByTestId('message-translated-text')).toBeNull();
    expect(screen.queryByTestId('message-original-text')).toBeNull();
  });
});
