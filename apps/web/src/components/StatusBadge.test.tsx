import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setLanguage } from '@/i18n';
import { StatusBadge } from './StatusBadge';

describe('StatusBadge', () => {
  it('always pairs the color with an icon and a translated label', async () => {
    await setLanguage('he');
    const { container } = render(<StatusBadge status="RED" />);
    expect(screen.getByText('מושבת')).toBeInTheDocument();
    expect(container.querySelector('svg')).not.toBeNull();
    await setLanguage('en');
  });
});
