import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@/i18n';
import { ThemeToggle } from './ThemeToggle';

describe('ThemeToggle', () => {
  it('defaults to dark and toggles to light and back, remembering the choice', () => {
    document.documentElement.dataset.theme = 'dark';
    render(<ThemeToggle />);
    const button = screen.getByTestId('theme-toggle');
    fireEvent.click(button);
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('fh.theme')).toBe('light');
    fireEvent.click(button);
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
